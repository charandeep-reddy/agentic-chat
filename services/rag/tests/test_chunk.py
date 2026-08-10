from app.chunk import chunk_text, count_tokens, embeddable_text

DOC = """# Billing

Invoices are generated on the first of each month.

## Refunds

Annual plans can be refunded within 30 days of purchase.
Monthly plans are not refundable once the period has started.

## Taxes

VAT is added for customers in the EU."""


def test_empty_input_produces_nothing():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_each_heading_section_gets_its_own_chunk():
    headings = [c.heading for c in chunk_text(DOC)]
    assert "Billing" in headings
    assert "Billing > Refunds" in headings
    assert "Billing > Taxes" in headings


def test_heading_trail_nests_by_depth():
    chunks = chunk_text("# A\n\ntext a\n\n## B\n\ntext b\n\n# C\n\ntext c")
    assert [c.heading for c in chunks] == ["A", "A > B", "C"]


def test_deeper_heading_replaces_only_its_level():
    chunks = chunk_text("# A\n\n## B\n\n### C\n\ndeep\n\n## D\n\nshallow")
    assert [c.heading for c in chunks] == ["A > B > C", "A > D"]


def test_sections_are_never_merged():
    refunds = next(c for c in chunk_text(DOC) if c.heading == "Billing > Refunds")
    assert "30 days" in refunds.text
    assert "VAT" not in refunds.text


def test_long_prose_splits_under_the_token_limit():
    long = "\n\n".join(
        f"Paragraph number {i} about retrieval augmented generation and how it "
        f"works in practice." for i in range(80)
    )
    chunks = chunk_text(long, chunk_tokens=100, overlap_tokens=0)
    assert len(chunks) > 1
    for chunk in chunks:
        assert count_tokens(chunk.text) <= 100


def test_oversized_paragraph_splits_on_sentences():
    sentence = "This sentence takes up a predictable amount of space. "
    chunks = chunk_text(sentence * 60, chunk_tokens=60, overlap_tokens=0)
    assert len(chunks) > 1
    # Sentence-level splitting, not mid-word cuts.
    for chunk in chunks:
        assert chunk.text.rstrip().endswith(".")


def test_structureless_text_is_hard_cut():
    chunks = chunk_text("x " * 500, chunk_tokens=50, overlap_tokens=0)
    assert len(chunks) > 1
    for chunk in chunks:
        assert count_tokens(chunk.text) <= 50


def test_overlap_repeats_the_previous_tail():
    paragraphs = [
        f"Paragraph {i} carries enough words to fill out the chunk budget here."
        for i in range(40)
    ]
    chunks = chunk_text("\n\n".join(paragraphs), chunk_tokens=80, overlap_tokens=20)
    assert len(chunks) > 1
    tail_word = chunks[0].text.split()[-1]
    assert tail_word in chunks[1].text


def test_token_sizing_is_denser_for_code_than_prose():
    # The reason chunking moved to a real tokenizer: identical character counts,
    # very different token counts. The old 4-chars-per-token rule sized both the
    # same and overshot badly on the second.
    prose = "the quick brown fox jumps over the lazy dog and then rests " * 4
    code = "const x=useMemo(()=>({a:1,b:2}),[]);async function f(){await g();}" * 4
    assert abs(len(prose) - len(code)) < 80
    assert count_tokens(code) > count_tokens(prose)


def test_chunks_are_numbered_in_document_order():
    chunks = chunk_text(DOC)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_short_trailing_fragment_folds_into_the_previous_chunk():
    chunks = chunk_text("# A\n\n" + "word " * 400 + "\n\nok", chunk_tokens=100)
    assert chunks[-1].text.rstrip().endswith("ok")
    assert count_tokens(chunks[-1].text) > 15


def test_embeddable_text_prepends_the_heading_trail():
    chunks = chunk_text("# Billing\n\n## Refunds\n\nWithin 30 days of purchase.")
    assert embeddable_text(chunks[0]).startswith("Billing > Refunds\n\n")


def test_embeddable_text_leaves_unheaded_text_alone():
    chunks = chunk_text("Within 30 days of purchase, refunds are available.")
    assert embeddable_text(chunks[0]) == chunks[0].text
