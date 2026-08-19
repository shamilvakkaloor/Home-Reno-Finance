// Minimal pub-sub store — the "reactivity" primitive for this vanilla app.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patchOrFn) {
      state = typeof patchOrFn === "function" ? patchOrFn(state) : { ...state, ...patchOrFn };
      listeners.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Subscribes to a Firestore query and keeps calling `onData` with the
 *  latest array of docs (each doc's data plus its id). Returns an unsubscribe fn. */
export function liveCollection(onSnapshot, queryRef, onData, onError) {
  return onSnapshot(
    queryRef,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("Firestore subscription error", err);
      if (onError) onError(err);
    }
  );
}
