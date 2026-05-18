---
title: Factions
layout: base.njk
permalink: /lorekeeper/wiki/factions/
---

# Factions

Organizations, governments, orders, and other groups that shape the universe.

{% if collections.factions and collections.factions.length %}
<ul>
  {% for entry in collections.factions %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No faction entries yet.</p>
{% endif %}
