module.exports = {
  permalink: (data) => {
    // page.filePathStem is something like:
    //   "/lorekeeper/index"
    //   "/lorekeeper/books/index"
    //   "/lorekeeper/books/book1/chapters/test-chapter"
    const stripped = data.page.filePathStem.replace(/^\/lorekeeper/, "");
    if (stripped === "/index" || stripped === "") {
      return "/library/index.html";
    }
    if (stripped.endsWith("/index")) {
      // "/books/index" → "/library/books/index.html"
      return "/library" + stripped.slice(0, -"/index".length) + "/index.html";
    }
    // Regular content file: serve as a directory-style URL
    // "/books/book1/chapters/test-chapter" → "/library/books/book1/chapters/test-chapter/index.html"
    return "/library" + stripped + "/index.html";
  },
};
