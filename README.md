![sac-banner](/public/static/images/logo_sac_card.png)

# Sociedad de Astonomía del Caribe

[![Donaciones PayPal](https://img.shields.io/static/v1?label=Donaciones-PayPal&message=%E2%9D%A4&link=https://www.paypal.com/donate/?hosted_button_id=XTV76Q6ESKNE4)](https://www.paypal.com/donate/?hosted_button_id=XTV76Q6ESKNE4)

[![Donaciones ATH Móvil](https://img.shields.io/static/v1?label=Donaciones-ATHMovil&message=%E2%9D%A4&link=https://athmovil.blob.core.windows.net/athmovildeeplinking/Deep-Linking/deep.html?133d0fe53fe0aee5f76f045eeebc2197b24c3664a213db7aa9d909ed1883b872)](https://athmovil.blob.core.windows.net/athmovildeeplinking/Deep-Linking/deep.html?133d0fe53fe0aee5f76f045eeebc2197b24c3664a213db7aa9d909ed1883b872)

## Adding Articles

Articles are created with either Markdown or MDX. These can be add directly in code or through Prose.io at https://prose.io/#abdielou/sac-website.

The default editor at Prose.io does not support MDX, but in theory MDX can be created equally. There are various important points to be noted out when creating an article through Prose.io.

### Uploading images.

Uploaded images cannot contain spaces or special characters in their name. They default to the `public/static/images/blog` but this path can be modified at the time of upload. Simply change the name to include the target folders.

For example, by default if you are going to upload the image `someImage.jpg`, it will default to:

- `public/static/images/blog/someImage.jpg`

Ideally this path should be modified to include the article's creation date like:

- `public/static/images/blog/2022/02/22/someImage.jpg`

### Metadata

The correct metadata is critical to properly publish the article. These are the available metadata fields and how they should be populated.

- **Is Draft**: Uncheck this field when you are done with changes and want to publish the article.
- **Summary**: This is the summary of the article in the listings
- **Tags**: There're a few pre-made tags but you can also add your own.
- **Authors**: The author's list cannot be modified but you can pick multiple authors at once.
- **Published date**: By default set to today's date but can be modified in the future.
- **Preview Image**: This field is the image shown on the article preview. You can temporarily pick the SAC logo and later modify to one of the images uploaded as described in the previous section. To set a new image, you must provide the full path (eg: `public/static/images/blog/2022/02/22/someImage.jpg`).
- **Preview Image Width**: If providing a custom image, you must define the width in pixels.
- **Preview Image Height**: If providing a custom image, you must define the height in pixels.
- **Raw Metadata**: Due to certain limitations, this MUST be used to define the article's title. Failure to do so will fail to publish further articles. Please add the title in the textbox as follows

```
title: Your article's title goes here
```

You can preview the article at any time clicking on the EYE button. Once you are done with changes you can click the SAVE button. Please provide a meaningful message before saving.

## Copyright © [Sociedad de Astronomía del Caribe](https://sociedadastronomia.com)
