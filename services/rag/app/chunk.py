"""Splitting a document into the units that get embedded and retrieved.

Ported from the TypeScript original, with one real upgrade: sizes are measured
in **tokens** via tiktoken rather than approximated at four characters per
token. The approximation was fine for English prose and wrong everywhere else —
code, CJK text, and long identifiers all tokenize far denser than 4:1, so a
"1,200 character" chunk of TypeScript could be double the intended token
budget, quietly blowing out the context the retrieved passages were sized for.

The strategy is unchanged: cut on the strongest boundary available (headings),
fall back to weaker ones (paragraphs, then sentences) only when a piece is still
too big, and hard-cut mid-sentence only as a last resort. Prose that an author
already organised into sections carries its own best split points.

Pure and synchronous: no database, no network, no model. The behaviour that
sets the ceiling on retrieval quality is directly unit-testable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

import tiktoken

from .config import settings

# Below this a chunk is mostly noise — a stray heading or a one-line stub.
MIN_CHUNK_TOKENS = 15

# Markdown ATX heading: one to six '#' then the text.
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*$")

# Paragraph boundaries: one or more blank lines.
_PARAGRAPH = re.compile(r"\n\s*\n")

# Sentence boundaries, approximately. A full parser is not worth it: a missed
# boundary costs a slightly longer chunk, not a wrong answer. The lookbehind
# keeps "e.g." and "v1.2" intact.
_SENTENCE = re.compile(r'(?<=[.!?])\s+(?=[A-Z("\'“])')


@dataclass
class Chunk:
    """One embeddable passage."""

    index: int
    text: str
    # The Markdown heading trail above this chunk, e.g. "Billing > Refunds".
    #
    # Prepended to the text before embedding and shown with the citation. A
    # chunk that says "This is capped at 30 days" is meaningless alone and
    # unambiguous under its heading, and the embedding of the two together
    # lands much closer to a question that names the section.
    heading: str | None


@lru_cache
def _encoding():
    return tiktoken.get_encoding(settings().tokenizer_encoding)


def count_tokens(text: str) -> int:
    return len(_encoding().encode(text, disallowed_special=()))


def _split_by_heading(text: str) -> list[tuple[str, str | None]]:
    """Group lines into blocks carrying the heading trail in force at that point.

    The trail is a stack indexed by heading depth, so a new '##' replaces the
    previous '##' and everything nested under it.
    """
    blocks: list[tuple[str, str | None]] = []
    trail: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        body = "\n".join(buffer).strip()
        buffer.clear()
        if body:
            blocks.append((body, " > ".join(t for t in trail if t) or None))

    for line in text.split("\n"):
        match = _HEADING.match(line)
        if not match:
            buffer.append(line)
            continue
        # The heading closes the previous block and opens the next one.
        flush()
        depth = len(match.group(1))
        del trail[depth - 1 :]
        trail.extend([""] * (depth - 1 - len(trail)))
        trail.append(match.group(2).strip())

    flush()
    return blocks


def _split_by_width(text: str, limit: int) -> list[str]:
    """Last resort: fixed-width token cuts for text with no structure at all."""
    encoding = _encoding()
    tokens = encoding.encode(text, disallowed_special=())
    return [
        encoding.decode(tokens[i : i + limit]) for i in range(0, len(tokens), limit)
    ]


def _pack(pieces: list[str], limit: int, subdivide) -> list[str]:
    """Pack small pieces up to `limit` tokens; recurse into oversized ones.

    Without packing, a document of one-line paragraphs becomes a document of
    one-line chunks — every vector strong on its own line and useless for
    answering anything.
    """
    out: list[str] = []
    current = ""

    def commit() -> None:
        nonlocal current
        if current.strip():
            out.append(current.strip())
        current = ""

    for piece in pieces:
        if count_tokens(piece) > limit:
            commit()
            out.extend(subdivide(piece))
            continue
        candidate = f"{current}\n\n{piece}" if current else piece
        if current and count_tokens(candidate) > limit:
            commit()
            candidate = piece
        current = candidate

    commit()
    return out


def _with_overlap(texts: list[str], overlap_tokens: int) -> list[str]:
    """Repeat the tail of each chunk at the head of the next.

    The answer to a question is often the sentence straddling a boundary;
    overlap means that sentence lives whole in at least one chunk. Applied after
    packing so the overlap is always a clean number of trailing tokens,
    whichever splitter produced the chunk.
    """
    if overlap_tokens <= 0:
        return texts

    encoding = _encoding()
    result: list[str] = []
    for i, text in enumerate(texts):
        if i == 0:
            result.append(text)
            continue
        previous = encoding.encode(texts[i - 1], disallowed_special=())
        tail = encoding.decode(previous[-overlap_tokens:]).strip()
        result.append(f"{tail}\n\n{text}" if tail else text)
    return result


def chunk_text(
    raw: str,
    chunk_tokens: int | None = None,
    overlap_tokens: int | None = None,
) -> list[Chunk]:
    """Split a document into embeddable chunks.

    Chunks are packed per heading section, never across one: two sections that
    happen to be short are still about different things, and merging them
    reintroduces exactly the averaged-out vector this is trying to avoid.
    """
    config = settings()
    limit = chunk_tokens if chunk_tokens is not None else config.chunk_tokens
    overlap = (
        overlap_tokens
        if overlap_tokens is not None
        else config.chunk_overlap_tokens
    )
    overlap = min(overlap, limit // 2)

    text = raw.replace("\r\n", "\n").strip()
    if not text:
        return []

    chunks: list[Chunk] = []

    for body, heading in _split_by_heading(text):
        paragraphs = [p.strip() for p in _PARAGRAPH.split(body) if p.strip()]
        packed = _pack(
            paragraphs,
            limit,
            lambda paragraph: _pack(
                [s.strip() for s in _SENTENCE.split(paragraph) if s.strip()],
                limit,
                lambda sentence: _split_by_width(sentence, limit),
            ),
        )

        for piece in _with_overlap(packed, overlap):
            # A short trailing fragment is folded back into the chunk before it
            # rather than stored as its own weak vector.
            if (
                count_tokens(piece) < MIN_CHUNK_TOKENS
                and chunks
                and chunks[-1].heading == heading
            ):
                chunks[-1].text = f"{chunks[-1].text}\n\n{piece}"
                continue
            chunks.append(Chunk(index=len(chunks), text=piece, heading=heading))

    return chunks


def embeddable_text(chunk: Chunk) -> str:
    """The exact string that gets embedded for a chunk.

    The heading trail is prepended so the vector carries section context, while
    the stored text stays clean for display and for the model to read. Keeping
    them different is the point: conflating them either pollutes the answer with
    breadcrumbs or throws away the context.
    """
    return f"{chunk.heading}\n\n{chunk.text}" if chunk.heading else chunk.text
