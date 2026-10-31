# `createOriginalTaskObserver` — `integrations/qiandengji/original-task-observer.ts`

The optional `cortico-world-qiandengji/original-task-observer` export assembles
the public core's dependency, observed-effect and no-effect-plan helpers for an
existing executor. It creates no game connection, action queue or model loop.

The host supplies its original steps and terminal outcomes, samples only steps
that actually execute, and reports whether inventory synchronization completed.
Unconfirmed inventory remains `null`. Explicit `needs` keeps priority, including
an empty array; speech content never creates a dependency.

Comparable repeat inspection covers pickup plans composed of goto, pickup,
look and wait. It reads the retained body's loaded targets, inventory and item
entities. Missing targets or item metadata leave comparison unknown. All loaded
item entities participate conservatively, so any new drop permits reconsideration.
Other plans receive effect summaries without this pickup comparison.

The shared core owns repeat counting and work-progress interpretation. Original
task terminals remain unchanged, and measured change never verifies a goal.
Reset the adapter on connection replacement and stop.
