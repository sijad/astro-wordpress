<?php
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
<?php endif; ?>
