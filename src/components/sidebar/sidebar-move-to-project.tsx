import { useProjects } from "../projects/projects-provider";
import { IconCheck } from "../icons";

/**
 * The second panel of a chat row's menu: where to move it.
 *
 * A flat list with a check against the current one, rather than a picker with
 * its own trigger. The menu is already open and already about this chat, so the
 * only question left is which project — and "No project" belongs in the same
 * list as the rest, since unfiling is the same kind of choice as filing.
 */
export function MoveToProject({
  current,
  onBack,
  onPick,
}: {
  current: string | null;
  onBack: () => void;
  onPick: (projectId: string | null) => void;
}) {
  const projects = useProjects();

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={onBack}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-micro font-medium uppercase tracking-wider text-text-faint hover:bg-surface hover:text-text-secondary"
      >
        <span aria-hidden>&lsaquo;</span>
        Move to project
      </button>
      <div className="my-1 border-t border-border-subtle" role="separator" />

      <div className="scroll-thin max-h-56 overflow-y-auto">
        <button
          type="button"
          role="menuitem"
          onClick={() => onPick(null)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-dense text-text-secondary hover:bg-surface hover:text-text"
        >
          <span className="w-3.5 shrink-0">
            {!current && <IconCheck size={13} className="text-accent" />}
          </span>
          No project
        </button>

        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(project.id)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-dense text-text-secondary hover:bg-surface hover:text-text"
          >
            <span className="w-3.5 shrink-0">
              {project.id === current && <IconCheck size={13} className="text-accent" />}
            </span>
            <span className="truncate">{project.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
