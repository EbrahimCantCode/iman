// Wake check state machine and the arithmetic fallback challenge (pure).
//
// Phases: ready -> alarm -> (challenge) -> done
// The alarm stops only in "done": a detected sink, or the solved challenge.
// The challenge unlocks after the configured number of failed photos, or as
// soon as the camera / detector is unavailable, so the sound can always be
// stopped.

/** Initial state. */
export function initialWakeState({ attempts = 5, mathCount = 3, difficulty = 'medium' } = {}) {
  return {
    phase: 'ready',
    failures: 0,
    attempts,
    mathCount,
    difficulty,
    fallbackAvailable: false,
    fallbackReason: null,
    problems: [],
    solved: 0,
    wrong: 0,
    result: null,
  };
}

/** Failed photos left before the fallback challenge unlocks. */
export const attemptsLeft = (s) => Math.max(0, s.attempts - s.failures);

/**
 * Pure reducer.
 * Events: start | success | fail | unavailable{reason} | openFallback{rng} | answer{value}
 */
export function wakeReducer(state, event) {
  switch (event.type) {
    case 'start':
      return state.phase === 'ready' ? { ...state, phase: 'alarm' } : state;

    case 'success':
      if (state.phase !== 'alarm') return state;
      return { ...state, phase: 'done', result: 'photo' };

    case 'fail': {
      if (state.phase !== 'alarm') return state;
      const failures = state.failures + 1;
      const unlocked = failures >= state.attempts;
      return {
        ...state,
        failures,
        fallbackAvailable: state.fallbackAvailable || unlocked,
        fallbackReason: state.fallbackReason ?? (unlocked ? 'attempts' : null),
      };
    }

    case 'unavailable':
      // Camera denied/missing or the detector failed to load.
      if (state.phase === 'done') return state;
      return { ...state, fallbackAvailable: true, fallbackReason: event.reason ?? 'unavailable' };

    case 'openFallback':
      if (state.phase !== 'alarm' || !state.fallbackAvailable) return state;
      return {
        ...state,
        phase: 'challenge',
        problems: makeProblems(state.mathCount, state.difficulty, event.rng),
        solved: 0,
      };

    case 'answer': {
      if (state.phase !== 'challenge') return state;
      const problem = state.problems[state.solved];
      if (!checkAnswer(problem, event.value)) return { ...state, wrong: state.wrong + 1 };
      const solved = state.solved + 1;
      return solved >= state.problems.length
        ? { ...state, solved, phase: 'done', result: 'challenge' }
        : { ...state, solved };
    }

    default:
      return state;
  }
}

const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/** One arithmetic problem: { text, answer }. */
export function makeProblem(difficulty, rng = Math.random) {
  if (difficulty === 'easy') {
    const a = int(rng, 2, 20);
    const b = int(rng, 2, 20);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (difficulty === 'hard') {
    const a = int(rng, 6, 19);
    const b = int(rng, 3, 9);
    const c = int(rng, 11, 99);
    return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
  }
  // medium: alternate two-digit addition and times tables
  if (rng() < 0.5) {
    const a = int(rng, 12, 89);
    const b = int(rng, 12, 89);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = int(rng, 3, 9);
  const b = int(rng, 6, 12);
  return { text: `${a} × ${b}`, answer: a * b };
}

export function makeProblems(count, difficulty, rng = Math.random) {
  return Array.from({ length: count }, () => makeProblem(difficulty, rng));
}

/** Compare an answer typed with Western or Arabic-Indic digits. */
export function checkAnswer(problem, input) {
  if (!problem) return false;
  const normalized = String(input ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  return /^-?\d+$/.test(normalized) && Number(normalized) === problem.answer;
}
