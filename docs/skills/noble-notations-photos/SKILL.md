---
name: noble-notations-photos
description: Put a photograph the person gives you onto a Noble Notations record — a recipe, a step, an ingredient, a run or a tag — without base64 and without sending the person to an upload page. Use whenever the person attaches or shares a picture and wants it on a recipe, step, ingredient, experiment or tag in Noble Notations.
---

# Put a photograph on a Noble Notations record

The person gave you a picture. Put it on the record yourself. Do not ask them
to open a link, and never base64-encode the picture into a tool call: a phone
photograph is millions of characters and fills the context window.

The file goes from your sandbox's disk straight to the server over HTTP. You
never read its bytes.

## Steps

1. **Find the file on disk.** Files the person attaches are in
   `/mnt/user-data/uploads/`. Run `ls -la /mnt/user-data/uploads/` and pick
   the picture. If there is no file there, you cannot use this skill: call
   `request_image_upload` and give the person the `link` instead.

2. **Decide the target.** Use the Noble Notations read tools (`get_recipe`,
   `search_recipes`, …) to find the slug. The `attachTo` shapes are:
   - `{ recipeSlug }` — the hero image of a recipe.
   - `{ recipeSlug, stepPosition }` — one step. The first step is 1;
     `get_recipe` counts from 0, so add 1.
   - `{ ingredientSlug }`, `{ experimentSlug }`,
     `{ experimentSlug, gallery: true }`, `{ tagSlug, categoryType }`.

3. **Call `request_image_upload`** with `attachTo` and `alt`. You can see the
   picture, so write `alt`: what it SHOWS, for a reader who cannot see it.
   Keep the `putUrl` from the result. It is good for one picture, for one
   hour.

4. **Shrink and send it** in code execution. The endpoint takes at most
   4.5 MB, and the store keeps nothing larger than 2400 px, so shrinking
   loses nothing:

   ```bash
   python3 - <<'EOF'
   from PIL import Image, ImageOps
   im = ImageOps.exif_transpose(Image.open("/mnt/user-data/uploads/PHOTO.jpg"))
   im = im.convert("RGB")
   im.thumbnail((2400, 2400))
   im.save("/tmp/nn-upload.jpg", "JPEG", quality=90)
   EOF
   curl -sS -X PUT --data-binary @/tmp/nn-upload.jpg \
     -H 'content-type: image/jpeg' \
     'PUT_URL_FROM_STEP_3'
   ```

   A success is JSON with the image `id`, `url` and `attachedTo`. The picture
   is already on the record. There is nothing more to set.

5. **Tell the person** in one line where the picture now is.

## When it fails

- **Network refused / could not resolve host.** The sandbox cannot reach the
  Noble Notations domain. Tell the person to allow that domain for code
  execution in their Claude settings, or fall back to the `link`.
- **410 (or 409), link already used or expired.** Call `request_image_upload` again.
- **413.** The file is still over 4.5 MB. Save it again with a lower quality.
- **400 asking for alt.** Add `?alt=` (URL-encoded) to the `putUrl`.

For several pictures (a run's gallery), request one link per picture.
