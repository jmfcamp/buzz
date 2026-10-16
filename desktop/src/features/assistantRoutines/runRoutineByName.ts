// "Wake the bots" typed to the Assistant runs that routine locally instead of sending it as chat.
import { toast } from "sonner";

import { matchRoutineInvocation } from "./routinesDoc";
import { runRoutine } from "./routinesRunner";
import { getRoutines } from "./routinesSync";

/** True when `text` named a routine (now running; result shown as a toast). */
export function tryRunRoutineByName(
  text: string,
  me: string | undefined,
): boolean {
  const routine = matchRoutineInvocation(text, getRoutines(me));
  if (!routine) return false;
  const id = toast.loading(`Running “${routine.name}”…`);
  void runRoutine(routine, me).then((run) =>
    run.ok
      ? toast.success(`${routine.name}: ${run.detail}`, { id })
      : toast.error(`${routine.name}: ${run.detail}`, { id }),
  );
  return true;
}
