// Long set-up work is cut into pieces, so the page keeps drawing while it
// runs: between two pieces the browser gets a frame. In a hidden tab there
// are no frames; a short timer keeps the work going there.

/** Resolves after the browser has had the chance to draw a frame. */
export const breathe = (): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 120);
  });
