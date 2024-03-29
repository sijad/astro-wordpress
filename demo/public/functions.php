<?php

function theme_setup(){
    add_theme_support( 'automatic-feed-links' );
    add_theme_support( 'title-tag' );
}
add_action('after_setup_theme','theme_setup');

function astro_wp_demo_init() {
  register_nav_menus(
    array(
        'main-menu'        => __( 'Main menu' ),
    )
  );
}
add_action( 'init', 'astro_wp_demo_init' );
