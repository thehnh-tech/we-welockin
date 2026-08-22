// Keyboard behaviour for the selection-pill radiogroups (charter pattern).
//
// A role="radio" set promises arrow-key selection and a single tab stop; both
// have to be implemented by hand on buttons. `tabIndexFor` gives the roving
// tabindex, `handleKeyDown` moves selection and focus together.

export function tabIndexFor<T>(value: T, current: T): 0 | -1 {
  return value === current ? 0 : -1;
}

const NAV_KEYS = [
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
  "Home",
  "End",
];

export function handleKeyDown<T>(
  e: React.KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  onChange: (v: T) => void
): void {
  if (!NAV_KEYS.includes(e.key)) return;
  e.preventDefault();

  const from = values.indexOf(current);
  let next: number;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = values.length - 1;
  else {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    // Wrap around, and treat "nothing selected" as starting before the first.
    next = ((from < 0 ? 0 : from + step) + values.length) % values.length;
  }

  onChange(values[next]);
  // Follow the selection with focus — the radios share one tab stop, so
  // leaving focus behind would strand the user on a -1 element.
  const group = e.currentTarget.closest('[role="radiogroup"]');
  group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
}
