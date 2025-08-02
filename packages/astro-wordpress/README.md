# astro-wordpress

**Astro adapter for WordPress theme development**

This adapter enables you to build WordPress themes using [Astro](https://astro.build/).
It allows you to create WordPress template files using `.php.astro` components under the `pages/` directory.

## Features

- Write WordPress themes using Astro's component syntax
- Hot-reload via proxying your local WordPress server during development
- Use `.php.astro` files to generate [WordPress template files](https://developer.wordpress.org/themes/basics/template-files/)

## Installation

### Prerequisites

- A working local WordPress site (e.g., running at `http://localhost:8001`)

### Steps

1. Create a new Astro project

   ```bash
   npm create astro@latest
   ```

2. Add the astro-wordpress adapter

   ```bash
   npx astro add astro-wordpress
   ```

3. Update your `astro.config.mjs`

   ```js
   // @ts-check
   import { defineConfig, passthroughImageService } from "astro/config";
   import wordpress from "astro-wordpress";

   // https://astro.build/config
   export default defineConfig({
     adapter: wordpress({
       devProxyTarget: "http://localhost:8001", // Your local WordPress URL
       outDir: "../wp-path/wp-content/themes/my-theme", // Output theme directory
     }),
     image: {
       service: passthroughImageService(),
     },
   });
   ```

4. Add a [style.css](https://developer.wordpress.org/themes/basics/main-stylesheet-style-css/) file to your `public/` directory, This is required by WordPress to recognize the theme

   ```css
   /*!
   Theme Name: My Theme
   Version: 0.0.1
   */
   ```

5. Create a php layout (e.g., `src/layouts/Layout.astro`)

   ```astro
   <!doctype html>
   <html
     lang="<?php echo get_bloginfo( 'language' ); ?>"
     dir="<?php echo is_rtl() ? 'rtl' : 'ltr'; ?>"
   >
     <head>
       <meta charset={`<?php bloginfo( 'charset' ); ?>`} />
       <meta http-equiv="x-ua-compatible" content="ie=edge" />
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <Fragment set:html={`<?php wp_head(); ?>`} />
     </head>
     <body class="<?php echo implode( ' ', get_body_class() ); ?>">
       <main>
         <slot />
       </main>

       <Fragment set:html={`<?php wp_footer(); ?>`} />
     </body>
   </html>
   ```

6. Add a index template `src/pages/index.php.astro`

   ```astro
   ---
   import Layout from "../layouts/Layout.astro";
   ---

   <Layout>
     <h1>
       <a href={`<?php echo get_home_url(); ?>`}>
         <Fragment set:html={`<?php bloginfo( 'name' ); ?>`} />
       </a>
     </h1>

     <h2 set:html={`<?php bloginfo( 'description' ); ?>`} />

     <Fragment
       set:html={`<?php
          if (have_posts()) :
            while (have_posts()) : the_post(); ?>
              <h3><a href="<?php echo get_permalink(); ?>"><?php the_title(); ?></a></h3>
            <?php
              the_content();
              wp_link_pages();
   
            endwhile;
   
            if (get_next_posts_link()) {
              next_posts_link();
            }
   
            if (get_previous_posts_link()) {
              previous_posts_link();
            };
   
          else : ?>
            <p>No posts found. :(</p>
    <?php endif; ?>`}
     />
   </Layout>
   ```

7. Start the dev server

   ```bash
   npm run dev
   ```

8. Activate the theme in the WordPress admin panel

## Build for Production

To generate your theme for production:

```bash
npm run build
```

The output will be generated in the directory you configured in `outDir`. You can zip the contents and upload them as a theme in WordPress.

## Importing PHP Files

You can import raw `.php` files into Astro components.

### Example

```astro
---
import myPhpCode from "../php-codes/my-code.php";
---

<h2>My php code result:</h2>
{myPhpCode}
```

## Custom Page Template

Due performance considerations, it's not currently possible to define custom page templates using the [traditional](https://developer.wordpress.org/themes/template-files-section/page-template-files/#creating-custom-page-templates-for-global-use) `/* Template Name: ... */` comment inside `.php.astro` files.

To define a custom page template in your Astro project, prefix the route filename with `page-template-`. for example:

```
src/pages/page-template-my-custom-template.php.astro
```

the `Template Name` comment will be automatically injected, allowing WordPress to recognize it as a valid custom page template.

**Resulting WordPress Template Name:**

```php
/* Template Name: My Custom Template */
```
