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

4. **Send it** in code execution. Send the original file when it is 4 MB or
   less and is a JPEG, PNG, WebP or AVIF: the server resizes it better than
   you can. Shrink it first only when it is larger, or is another type such
   as HEIC. A Vercel function refuses a body over 4.5 MB, and the store keeps
   nothing larger than 2400 px, so shrinking loses nothing.

   ```bash
   python3 - <<'EOF'
   import os, subprocess, sys
   src = "/mnt/user-data/uploads/PHOTO.jpg"
   types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp", ".avif": "image/avif"}
   ext = os.path.splitext(src)[1].lower()
   if ext in types and os.path.getsize(src) <= 4 * 1024 * 1024:
       out, ctype = src, types[ext]
   else:
       if ext in (".heic", ".heif"):
           subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                           "pillow-heif"], check=True)
           import pillow_heif; pillow_heif.register_heif_opener()
       from PIL import Image, ImageOps
       im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
       im.thumbnail((2400, 2400))
       out, ctype = "/tmp/nn-upload.jpg", "image/jpeg"
       im.save(out, "JPEG", quality=90)
   print(out, ctype)
   EOF
   curl -sS -X PUT --data-binary @OUT_FROM_ABOVE \
     -H 'content-type: CTYPE_FROM_ABOVE' \
     'PUT_URL_FROM_STEP_3'
   ```

   If `pillow-heif` will not install (no network to the package index), do
   not guess: give the person the `link` from step 3 instead.

   A success is JSON with the image `id`, `url` and `attachedTo`. The picture
   is already on the record. There is nothing more to set.

5. **Tell the person** in one line where the picture now is.

## When it fails

- **Network refused / could not resolve host.** The sandbox cannot reach the
  Noble Notations domain. Tell the person to allow that domain for code
  execution in their Claude settings, or fall back to the `link`.
- **410 (or 409), link already used or expired.** Call `request_image_upload` again.
- **413.** The file is over 4.5 MB. This answer comes from the platform
  and is not JSON. Shrink the file as in step 4 and send it again.
- **422.** The server could not read the image, or it does not take that
  type. Convert it to JPEG as in step 4 and send it again.
- **400 asking for alt.** Add `?alt=` (URL-encoded) to the `putUrl`.

For several pictures (a run's gallery), request one link per picture.

## Setup (for the person, once)

Nothing loads this file by itself. To use it in the Claude app:

1. Turn on code execution.
2. Allow code execution to reach the Noble Notations domain. The default
   network setting (package managers only) blocks the upload.
3. Zip this folder and add it as a custom skill.
