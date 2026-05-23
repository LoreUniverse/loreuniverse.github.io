---
title: Locations
layout: base.njk
permalink: /wiki/locations/
---

# Locations

Places of significance — cities, regions, planets, and dimensions.

{% if collections.locations and collections.locations.length %}
<ul>
  {% for entry in collections.locations %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No location entries yet.</p>
{% endif %}
