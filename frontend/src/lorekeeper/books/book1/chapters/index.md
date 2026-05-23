---
title: Chapters
layout: base.njk
---

# Chapters

{% if collections.chapters and collections.chapters.length %}
<ul>
  {% for entry in collections.chapters %}
  <li>
    <a href="{{ entry.url }}">
      Chapter {{ entry.data.chapter_number }} — {{ entry.data.title }}
    </a>
    {% if entry.data.arc %}<span> ({{ entry.data.arc }})</span>{% endif %}
    {% if entry.data.summary %}<p>{{ entry.data.summary }}</p>{% endif %}
  </li>
  {% endfor %}
</ul>
{% else %}
<p>No chapters published yet.</p>
{% endif %}
