<?php

function theme_setup(){
    add_theme_support( 'automatic-feed-links' );
    add_theme_support( 'title-tag' );
}
add_action('after_setup_theme','theme_setup');

