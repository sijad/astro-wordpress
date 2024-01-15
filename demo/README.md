# Astro WordPress Demo

## Installation Steps

1. **Navigate to your WordPress Project Directory**

   Open your terminal and navigate to the `wp-contents` directory of your WordPress project:

   ```bash
   cd ~/my-wordpress-site/wp-contents
   ```

2. **Backup Existing Themes**

   To ensure you have a backup of your current themes, rename the `themes` directory to `themes-back`:

   ```bash
   mv themes themes-back
   ```

3. **Move Demo to WordPress**

   Move the `astro-wordpress/demo` directory to `themes/`:

   ```bash
   mv ~/astro-wordpress/demo ~/my-wordpress-site/wp-contents/themes/
   ```

4. **Update Astro Config**

   Change your directory to the `themes` directory and edit the `astro.config.mjs` file to update `devProxyTarget` to point to your local WordPress url:

   ```bash
   cd themes

   # Use your preferred text editor, e.g., nano, vim, or VSCode
   edit astro.config.mjs
   ```

   Remember to save your changes.

5. **Run Development Server**

   Install dependencies and run Astro dev:

   ```bash
   npm i
   npm run dev
   ```

6. **Activate Theme in WordPress Admin**

   Go to your local WordPress site's admin panel (wp-admin). Navigate to the 'Appearance' > 'Themes' and activate the Demo theme.
