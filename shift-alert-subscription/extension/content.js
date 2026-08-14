(() => {
  const clean = value => (value || "").replace(/\s+/g, " ").trim();
  const hash = value => [...value].reduce((number, char) => ((number << 5) - number + char.charCodeAt(0)) | 0, 0).toString(36);
  function scan() {
    if (!location.hash.includes("/jobSearch")) return [];
    return [...document.querySelectorAll("[role='link']")]
      .map(card => clean(card.innerText))
      .filter(text => /\d+\s+shifts?\s+available/i.test(text))
      .slice(0, 20)
      .map(text => ({
        id: hash(text), title: text.split(" shifts available")[0],
        location: (text.match(/([^,]+,\s*(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT))\b/i) || [])[1] || "",
        pay: (text.match(/\$\s*\d+(?:\.\d{1,2})?/i) || [])[0] || "",
        schedule: (text.match(/(?:full|part)[\s-]?time/i) || [])[0] || ""
      }));
  }
  setTimeout(() => { const jobs = scan(); if (jobs.length) chrome.runtime.sendMessage({ type: "jobs-found", jobs }); }, 1000);
})();
