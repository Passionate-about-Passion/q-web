// Long set-up work is cut into pieces, so the page keeps drawing while it
// runs: between two pieces the browser draws a frame. One piece per frame
// keeps the thread free for the animation that is on screen; pieces that
// follow each other on a bare timer fill it up again. In a hidden tab there
// are no frames, so a short timer keeps the work going there.

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
