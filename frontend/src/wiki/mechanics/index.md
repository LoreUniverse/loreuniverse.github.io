---
title: Mechanics
layout: base.njk
permalink: /wiki/mechanics/
---

# Mechanics

The fundamental rules and systems that govern the Lore Universe.

{% if collections.mechanics and collections.mechanics.length %}
<ul>
  {% for entry in collections.mechanics %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No mechanic entries yet.</p>
{% endif %}
