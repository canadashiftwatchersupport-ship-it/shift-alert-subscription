globalThis.CSW_SHIFT_FILTER = (() => {
  const minutes = value => {
    const m = /^(\d{2}):(\d{2})$/.exec(value || '');
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  };
  function ranges(text) {
    const result = [];
    const value = String(text || '');
    const twelve = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/gi;
    for (const m of value.matchAll(twelve)) {
      if (+m[1] < 1 || +m[1] > 12 || +(m[2] || 0) > 59 || +m[4] < 1 || +m[4] > 12 || +(m[5] || 0) > 59) continue;
      result.push([(+m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0)) * 60 + +(m[2] || 0), (+m[4] % 12 + (m[6].toLowerCase() === 'p' ? 12 : 0)) * 60 + +(m[5] || 0)]);
    }
    const twentyFour = /\b(\d{1,2}):(\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}):(\d{2})(?!\s*[ap]\.?m)(?!\d)/gi;
    for (const m of value.matchAll(twentyFour)) {
      if (+m[1] < 24 && +m[2] < 60 && +m[3] < 24 && +m[4] < 60) result.push([+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
    }
    return result;
  }
  const starts = text => ranges(text).map(pair => pair[0]);
  function classify(text) {
    const value = String(text || '').toLowerCase();
    const day = /\bday(?:time)?\s*shifts?\b/.test(value), night = /\b(?:night|overnight)\s*shifts?\b/.test(value);
    if (day || night) return day && night ? 'mixed' : day ? 'day' : 'night';
    const types = new Set(starts(text).map(time => time >= 360 && time < 1080 ? 'day' : 'night'));
    return types.size > 1 ? 'mixed' : [...types][0] || 'unknown';
  }
  function matches(text, preference, from, to) {
    if (preference && preference !== 'any' && classify(text) !== preference) return false;
    if (!from && !to) return true;
    const start = minutes(from), end = minutes(to), times = ranges(text);
    if (start === null || end === null || !times.length) return false;
    return times.every(pair => pair[0] === start && pair[1] === end);
  }
  return { classify, matches, starts, ranges, minutes };
})();
