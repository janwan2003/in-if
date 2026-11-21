// Resolution of sealed, conditional commitments.
//
// Each member answers 'in', 'out' or nothing. An 'in' may carry conditions:
//   condMin   - "only if at least N are going" (N counts me)
//   condNames - "only if these members are going" (member ids)
// The going set is the largest set of 'in' members whose conditions all hold
// inside that set. Conditions are monotone (more people never breaks one), so
// the greatest fixed point is found by starting from every 'in' and dropping
// anyone whose condition fails until nothing changes.

export function resolve(members) {
  const ins = members.filter((m) => m.status === 'in');
  const going = new Set(ins.map((m) => m.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of ins) {
      if (!going.has(m.id)) continue;
      if (!holds(m, going)) {
        going.delete(m.id);
        changed = true;
      }
    }
  }
  const waiting = ins.filter((m) => !going.has(m.id)).map((m) => m.id);
  return { going: ins.filter((m) => going.has(m.id)).map((m) => m.id), waiting };
}

function holds(m, going) {
  if (m.condMin && going.size < m.condMin) return false;
  for (const id of m.condNames || []) {
    if (id !== m.id && !going.has(id)) return false;
  }
  return true;
}

// Plan state at time `now`. A plan tips the first moment the going set reaches
// the target before the deadline; once tipped it stays tipped.
export function planState(plan, members, now = Date.now()) {
  const r = resolve(members);
  let tipped = !!plan.tippedAt;
  const expired = !tipped && now >= plan.deadline;
  const tipsNow = !tipped && !expired && r.going.length >= plan.target;
  if (tipsNow) tipped = true;
  return { ...r, tipped, tipsNow, expired, open: !tipped && !expired };
}

// Anonymous summary of conditions among the going set, shown after the tip:
// e.g. "2 were in only if Tom came". Counts only, never whose condition it was.
export function conditionLines(members, goingIds, nameOf) {
  const going = new Set(goingIds);
  const byName = new Map();
  let minCount = 0;
  for (const m of members) {
    if (!going.has(m.id)) continue;
    if (m.condMin) minCount++;
    for (const id of m.condNames || []) {
      if (id === m.id || !going.has(id)) continue;
      byName.set(id, (byName.get(id) || 0) + 1);
    }
  }
  const lines = [];
  for (const [id, n] of [...byName].sort((a, b) => b[1] - a[1])) {
    lines.push({ count: n, kind: 'name', name: nameOf(id) });
  }
  if (minCount) lines.push({ count: minCount, kind: 'min' });
  return lines;
}
