---
title: Lore Traits
layout: base.njk
permalink: /wiki/lore-traits/
---

# Lore Traits

The magic system of the Lore Universe — traits that characters possess, their subtypes, and abilities.

{% if collections.loreTraits and collections.loreTraits.length %}
<ul>
  {% for entry in collections.loreTraits %}
  <li><a href="{{ entry.url }}">{{ entry.data.name }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No lore trait entries yet.</p>
{% endif %}
