---
title: Novels
layout: base.njk
---

# Novels

A serialized sci-fi/fantasy novel and a companion wiki for its universe. The wiki serves both as a standalone reference and as an in-line reading aid, with links embedded in chapter prose that connect readers to relevant entries on characters, locations, factions, and lore.

---

## Submodules

### Books
Read the chapters. Currently one book is in progress.

[Browse books →]({{ site.modules.lorekeeper.books }}/)

### Wiki
The universe's encyclopedia — characters, locations, factions, lore traits, mechanics, and lore.

[Browse the wiki →]({{ site.modules.lorekeeper.wiki }}/)

---

{#
  Discovery section. Once the site has enough content, this should pull
  dynamic previews from the chapters and wiki collections — latest
  chapter, popular wiki entries, content stats — so that visitors who
  land here can scan what is available without clicking through.
#}
## Latest chapter

{% set latest = collections.chapters | last %}
{% if latest %}
  <article>
    <p><strong>{{ latest.data.title }}</strong> — Chapter {{ latest.data.chapter_number }}</p>
    {% if latest.data.summary %}<p>{{ latest.data.summary }}</p>{% endif %}
    <p><a href="{{ latest.url }}">Read this chapter →</a></p>
  </article>
{% else %}
  <p>No chapters published yet.</p>
{% endif %}
