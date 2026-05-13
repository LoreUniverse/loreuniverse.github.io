---
title: Lore
layout: base.njk
permalink: /wiki/lore/
---

# Lore

History, myths, and events that form the foundation of the universe.

{% if collections.lore and collections.lore.length %}
<ul>
  {% for entry in collections.lore %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No lore entries yet.</p>
{% endif %}
