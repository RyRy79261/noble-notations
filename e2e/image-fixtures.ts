/**
 * Pictures for the suite, as base64, with no side effects.
 *
 * A file of its own for the same reason `e2e/github-stub-contract.ts` is:
 * two specs and the deleted-record fixture all need the same bytes, and a
 * spec that imported another spec to borrow a constant would run that
 * spec's `beforeAll` inside the wrong worker.
 *
 * THEY ARE REAL PNGs, not a string that decodes to something. `processImage`
 * checks the declared type against what `sharp` reads out of the bytes and
 * refuses a disagreement, so a placeholder would only ever exercise the
 * refusal.
 *
 * Each is a different size, which is what makes them different pictures: the
 * store de-duplicates on the sha256 of the ENCODED result, so two images
 * that resize to the same WebP are one row by design. A test that needs two
 * rows needs two genuinely different images.
 */

/** 4 × 4, flat red. */
export const RED_4X4_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1Jr' +
  'AAAAEElEQVQImWM4IScHRwzEcQCxYxBB16puEAAAAABJRU5ErkJggg==';

/** 6 × 4, flat blue. A different size, so a different checksum. */
export const BLUE_6X4_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1Jr' +
  'AAAAEUlEQVQImWMQiTqBhhjIFQIAQAgdEYfP1m4AAAAASUVORK5CYII=';

/**
 * Not an image at all — the word "no", in base64.
 *
 * For the refusal that says so. `Buffer.from(…, 'base64')` ignores what it
 * cannot read rather than throwing, so bytes that decode to something short
 * and meaningless are the case that has to reach `sharp` and be refused
 * there.
 */
export const NOT_AN_IMAGE = Buffer.from('no', 'utf8').toString('base64');
