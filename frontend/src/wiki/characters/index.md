---
title: Characters
layout: base.njk
permalink: /wiki/characters/
---

# Characters

People and beings of the Lore Universe.

{% if collections.characters and collections.characters.length %}
<ul>
  {% for entry in collections.characters %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No character entries yet.</p>
{% endif %}
