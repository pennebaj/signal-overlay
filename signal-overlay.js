(function () {
  "use strict";
  var ID = "__signal_ov__";
  var FONTS = "https://fonts.googleapis.com/css2?family=Oxygen:wght@300;400;700&display=swap";
  var VC = [
    { bg: "rgba(56,189,248,0.10)",  border: "#38bdf8", text: "#0284c7", dot: "#38bdf8" },
    { bg: "rgba(59,130,246,0.10)",  border: "#3b82f6", text: "#1d4ed8", dot: "#3b82f6" },
    { bg: "rgba(168,85,247,0.10)",  border: "#a855f7", text: "#7e22ce", dot: "#a855f7" },
    { bg: "rgba(244,114,182,0.10)", border: "#f472b6", text: "#be185d", dot: "#f472b6" },
    { bg: "rgba(219,39,119,0.10)",  border: "#db2777", text: "#9d174d", dot: "#db2777" }
  ];
  var FO = ["pdp", "atc", "checkout", "purchase shopify", "purchase", "subscription"];

  // Map goal name to short conv. label
  function convLabel(goalName) {
    var lc = goalName.toLowerCase();
    if (lc.indexOf("pdp") !== -1) return "PDP Views";
    if (lc.indexOf("atc") !== -1 || lc.indexOf("add to cart") !== -1) return "ATC";
    if (lc.indexOf("checkout") !== -1) return "Checkout";
    if (lc.indexOf("subscription") !== -1) return "Subscriptions";
    if (lc.indexOf("purchase") !== -1) return "Purchases";
    return "Conv.";
  }

  // Normalize raw Convert goal names to friendly display names
  function normalizeName(name) {
    var t = name.trim();
    if (/pdp view/i.test(t)) return "PDP Views";
    if (/^atc\s*\d*$/i.test(t) || /atc\s+\d+/i.test(t)) return "ATC";
    if (/purchase shopify customer event/i.test(t)) return "Purchases";
    if (/purchase\s*-\s*subscription/i.test(t)) return "Subscriptions";
    return t;
  }

  // Is this a revenue goal (Purchase or Subscription)?
  function isRevenueGoal(goalName) {
    var lc = goalName.toLowerCase();
    return lc.indexOf("purchase") !== -1 || lc.indexOf("subscription") !== -1;
  }

  function pp(s) {
    if (!s || s === "\u2014" || s === "-") return null;
    var m = s.replace(/[\u25b2\u25bc+]/g, "").replace(/,/g, "").match(/(-?[\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function fr(n) {
    var lc = n.toLowerCase();
    for (var i = 0; i < FO.length; i++) { if (lc.indexOf(FO[i]) !== -1) return i; }
    return 99;
  }

  function dm(conf, color) {
    var f = conf === null ? 0 : Math.round(conf / 10);
    var activeColor = (conf !== null && conf >= 90) ? color : "#9ca3af";
    var h = '<span style="display:inline-flex;gap:2px;align-items:center;">';
    for (var i = 0; i < 10; i++) {
      h += '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (i < f ? activeColor : "#e5e7eb") + ';"></span>';
    }
    return h + "</span>";
  }

  function metricColor(imp) {
    if (imp === null) return "#9ca3af";
    if (imp >= 3)    return "#00c047";
    if (imp >= 0)    return "#72a790";  // 0% to +2.99% — muted green
    if (imp > -3)    return "#ba9197";  // -2.99% to 0% — muted red
    if (imp >= -10)  return "#f87171";
    return "#dc2626";
  }

  function lb(imp, vi) {
    if (imp === null) return '<span style="color:#9ca3af;font-size:11px;font-style:italic;">baseline</span>';
    var c = metricColor(imp);
    var a = imp >= 0 ? "\u25b2 +" : "\u25bc ";
    return '<span style="color:' + c + ';font-family:Oxygen,sans-serif;font-size:13px;font-weight:600;">' + a + imp.toFixed(2) + "%</span>";
  }

  function fmtCurrency(s) {
    // Format a string like "$64,754.7" cleanly
    if (!s || s === "\u2014") return "\u2014";
    // Extract numeric value and reformat
    var clean = s.replace(/[$,]/g, "");
    var n = parseFloat(clean);
    if (isNaN(n)) return s;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Parse a single table's rows given known column indices
  function parseTableRows(table, cN, cI, cV, cCv, cCR, cCf) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tr"));
    var variations = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var cells = Array.prototype.slice.call(rows[ri].querySelectorAll("td,th"));
      if (cells.length < 4) continue;
      var texts = cells.map(function (c) { return c.textContent.replace(/\s+/g, " ").trim(); });
      if (texts.some(function (t) { return /^variations?$/i.test(t); })) continue;
      var rawName = texts[cN] || "";
      if (!rawName) continue;
      var isB = rawName.toLowerCase().indexOf("baseline") !== -1 || rawName.toLowerCase().indexOf("original") !== -1;
      var name = rawName.replace(/\s*Baseline\s*/gi, "").trim() || "Original";
      var imp = isB ? null : pp(texts[cI] || "");
      var vis = parseInt((texts[cV] || "").replace(/,/g, ""), 10) || null;
      var conv = parseInt((texts[cCv] || "").replace(/,/g, ""), 10) || null;
      var rawCR = texts[cCR] || "";
      var cr = rawCR ? rawCR.split("\u00b1")[0].trim() : null;
      var rawCf = texts[cCf] || "";
      var conf = rawCf && rawCf !== "\u2014" ? parseFloat(rawCf) : null;
      variations.push({ name: name, isB: isB, imp: imp, vis: vis, conv: conv, cr: cr, conf: conf });
    }
    return variations;
  }

  // Parse revenue data from RPV table (Revenue | RPV | AOV columns)
  function parseRevenueRows(table) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tr"));
    var result = [];
    var cN = 1, cI = 2, cRev = 3, cAOV = 5;
    // Detect header columns
    var hc = Array.prototype.slice.call(rows[0].querySelectorAll("td,th")).map(function (c) {
      return c.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    });
    hc.forEach(function (t, i) {
      if (/^variations?$/i.test(t)) cN = i;
      else if (/^improvement$/i.test(t)) cI = i;
      else if (/^revenue$/i.test(t)) cRev = i;
      else if (/^aov$/i.test(t)) cAOV = i;
    });
    for (var ri = 0; ri < rows.length; ri++) {
      var cells = Array.prototype.slice.call(rows[ri].querySelectorAll("td,th"));
      if (cells.length < 4) continue;
      var texts = cells.map(function (c) { return c.textContent.replace(/\s+/g, " ").trim(); });
      if (texts.some(function (t) { return /^variations?$/i.test(t); })) continue;
      var rawName = texts[cN] || "";
      if (!rawName) continue;
      var isB = rawName.toLowerCase().indexOf("baseline") !== -1 || rawName.toLowerCase().indexOf("original") !== -1;
      var name = rawName.replace(/\s*Baseline\s*/gi, "").trim() || "Original";
      var revImp = isB ? null : pp(texts[cI] || "");
      var rev = texts[cRev] || "\u2014";
      var aov = texts[cAOV] || "\u2014";
      // Clean up AOV - remove ± part
      if (aov.indexOf("\u00b1") !== -1) aov = aov.split("\u00b1")[0].trim();
      result.push({ name: name, isB: isB, revImp: revImp, rev: rev, aov: aov });
    }
    return result;
  }

  function getColumnIndices(table) {
    var rows = Array.prototype.slice.call(table.querySelectorAll("tr"));
    var cN = 1, cI = 2, cV = 3, cCv = 4, cCR = 5, cCf = 6;
    if (rows.length === 0) return { cN: cN, cI: cI, cV: cV, cCv: cCv, cCR: cCR, cCf: cCf };
    var hc = Array.prototype.slice.call(rows[0].querySelectorAll("td,th")).map(function (c) {
      return c.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    });
    hc.forEach(function (t, i) {
      if (/^variations?$/i.test(t)) cN = i;
      else if (/^improvement$/i.test(t)) cI = i;
      else if (/^visitors$/i.test(t)) cV = i;
      else if (/^conversions$/i.test(t)) cCv = i;
      else if (/^conversion rate$/i.test(t)) cCR = i;
      else if (/^confidence level$/i.test(t)) cCf = i;
    });
    return { cN: cN, cI: cI, cV: cV, cCv: cCv, cCR: cCR, cCf: cCf };
  }

  // Click RPV button near a table and return a promise that resolves with revenue rows
  function fetchRevenueData(tableIndex) {
    return new Promise(function (resolve) {
      var tables = document.querySelectorAll("table");
      var table = tables[tableIndex];
      if (!table) { resolve([]); return; }
      // Find the RPV button in the same section as this table
      var section = table.parentElement;
      for (var d = 0; d < 10 && section; d++) {
        var rpvBtn = section.querySelector("button");
        var btns = Array.prototype.slice.call(section.querySelectorAll("button"));
        var rpv = btns.filter(function (b) { return b.textContent.trim() === "Revenue Per Visitor (RPV)"; })[0];
        if (rpv) {
          rpv.click();
          setTimeout(function () {
            // Re-query table after click (React may re-render)
            var newTables = document.querySelectorAll("table");
            var newTable = newTables[tableIndex];
            var revRows = newTable ? parseRevenueRows(newTable) : [];
            // Switch back to CR view
            var crBtns = Array.prototype.slice.call(section.querySelectorAll("button")).filter(function (b) { return b.textContent.trim() === "Conversion Rate (CR)"; });
            if (crBtns[0]) crBtns[0].click();
            resolve(revRows);
          }, 600);
          return;
        }
        section = section.parentElement;
      }
      resolve([]);
    });
  }

  function parseTables() {
    var tables = Array.prototype.slice.call(document.querySelectorAll("table"));
    var goals = [];
    for (var ti = 2; ti < tables.length; ti++) {
      var table = tables[ti];
      var rows = Array.prototype.slice.call(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;
      var goalName = "Goal " + (ti - 1), el = table, found = false;
      for (var depth = 0; depth < 15 && el && !found; depth++) {
        var sib = el.previousElementSibling;
        while (sib) {
          var h = sib.querySelector("h6,h5,h4") || (["H6", "H5", "H4"].indexOf(sib.tagName) !== -1 ? sib : null);
          if (h) { goalName = normalizeName(h.textContent.trim()); found = true; break; }
          sib = sib.previousElementSibling;
        }
        el = el.parentElement;
      }
      var idx = getColumnIndices(table);
      var variations = parseTableRows(table, idx.cN, idx.cI, idx.cV, idx.cCv, idx.cCR, idx.cCf);
      if (variations.length > 0) goals.push({ name: goalName, rank: fr(goalName), variations: variations, tableIndex: ti, revenueRows: null });
    }
    goals.sort(function (a, b) { return a.rank - b.rank; });
    return goals;
  }

  function parseMeta() {
    var tables = Array.prototype.slice.call(document.querySelectorAll("table"));
    if (!tables[0]) return {};
    var text = tables[0].textContent.replace(/\s+/g, " ");
    var meta = {};
    var m2 = text.match(/Days Running\s*(\d+)/); if (m2) meta.days = m2[1];
    var m3 = text.match(/All Tested Users\s*([\d,]+)/); if (m3) meta.users = m3[1];
    var m4 = text.match(/Total Conversions\s*([\d,]+)/); if (m4) meta.conv = m4[1];
    var tp = document.title.split(" - ");
    meta.name = tp.length >= 2 ? tp[1].trim() : (tp[0] || "Experiment");
    return meta;
  }

  function renderCard(goal, cardIndex) {
    var vars = goal.variations;
    if (!vars.some(function (v) { return v.vis !== null; })) return "";
    var iconMap = { pdp: "\uD83D\uDC41", atc: "\uD83D\uDED2", checkout: "\uD83D\uDCB3", purchase: "\u2705", subscription: "\uD83D\uDD04" };
    var icon = "\uD83D\uDCCA";
    var lc = goal.name.toLowerCase();
    var ks = Object.keys(iconMap);
    for (var k = 0; k < ks.length; k++) { if (lc.indexOf(ks[k]) !== -1) { icon = iconMap[ks[k]]; break; } }
    var best = vars.filter(function (v) { return !v.isB && v.imp !== null; }).sort(function (a, b) { return (b.imp || 0) - (a.imp || 0); })[0];
    var bestIdx = best ? vars.indexOf(best) % 4 : -1;
    var bc = bestIdx >= 0 ? VC[bestIdx] : null;
    var convCol = convLabel(goal.name);
    var hasRevenue = isRevenueGoal(goal.name) && goal.revenueRows && goal.revenueRows.length > 0;

    // Build revenue lookup by variation name
    var revMap = {};
    if (hasRevenue) {
      goal.revenueRows.forEach(function (r) { revMap[r.name] = r; });
      // Also map baseline
      goal.revenueRows.forEach(function (r) { if (r.isB) revMap["__baseline__"] = r; });
    }
    var baselineAOV = null;
    if (hasRevenue && revMap["__baseline__"]) {
      var bAOVStr = revMap["__baseline__"].aov;
      baselineAOV = parseFloat(bAOVStr.replace(/[$,]/g, ""));
    }

    var rows = "";
    vars.forEach(function (v, vi) {
      var col = VC[vi % 4];
      var dots = v.isB ? "" : dm(v.conf, col.dot);
      var isBest = best && v === best;
      var rowBg = isBest ? bc.bg : "transparent";

      // Revenue cells
      var revCells = "";
      if (hasRevenue) {
        var rKey = v.isB ? "__baseline__" : v.name;
        var rd = revMap[rKey];
        if (!rd) {
          // Try fuzzy match
          var keys = Object.keys(revMap);
          for (var ki = 0; ki < keys.length; ki++) {
            if (keys[ki] !== "__baseline__" && v.name.indexOf(keys[ki]) !== -1) { rd = revMap[keys[ki]]; break; }
          }
        }
        var revVal = rd ? fmtCurrency(rd.rev) : "\u2014";
        var aovVal = rd ? fmtCurrency(rd.aov) : "\u2014";
        var revImpHtml = v.isB ? '<span style="color:#9ca3af;font-size:11px;">baseline</span>' : (rd && rd.revImp !== null ? lb(rd.revImp, vi) : "\u2014");
        // Delta AOV
        var dAOVHtml = "\u2014";
        if (!v.isB && rd && baselineAOV !== null) {
          var curAOV = parseFloat((rd.aov || "").replace(/[$,]/g, ""));
          if (!isNaN(curAOV) && baselineAOV !== 0) {
            var dAOV = ((curAOV - baselineAOV) / baselineAOV) * 100;
            var dAOVColor = metricColor(dAOV);
            var dAOVArrow = dAOV >= 0 ? "\u25b2 +" : "\u25bc ";
            dAOVHtml = '<span style="color:' + dAOVColor + ';font-family:Oxygen,sans-serif;font-size:12px;font-weight:600;">' + dAOVArrow + dAOV.toFixed(2) + "%</span>";
          }
        }
        // Divider + revenue columns
        revCells = '<td style="padding:6px 0;width:1px;"><div style="width:1px;height:100%;background:#e2e8f0;margin:0 4px;"></div></td>'
          + '<td style="padding:6px 14px;text-align:right;font-family:Oxygen,sans-serif;font-size:13px;color:#374151;white-space:nowrap;">' + revVal + '</td>'
          + '<td style="padding:6px 14px;text-align:right;white-space:nowrap;">' + revImpHtml + '</td>'
          + '<td style="padding:6px 14px;text-align:right;font-family:Oxygen,sans-serif;font-size:13px;color:#374151;white-space:nowrap;">' + aovVal + '</td>'
          + '<td style="padding:6px 14px;text-align:right;white-space:nowrap;">' + dAOVHtml + '</td>';
      }

      rows += '<tr style="background:' + rowBg + ';border-bottom:1px solid #f1f5f9;">'
        + '<td style="padding:0px 16px;min-width:180px;">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col.border + ';flex-shrink:0;"></span>'
        + '<span style="font-size:13px;font-weight:500;color:#111827;">' + esc(v.name) + '</span>'
        + (v.isB ? '<span style="font-size:10px;background:#f3f4f6;color:#6b7280;padding:1px 5px;border-radius:4px;font-weight:500;">baseline</span>' : "")
        + (isBest ? '<span style="font-size:10px;background:' + bc.border + ';color:#fff;padding:1px 6px;border-radius:4px;font-weight:600;">\u2605 Best</span>' : "")
        + '</div>'
        + '</td>'
        + '<td style="padding:0px 16px;text-align:right;font-family:Oxygen,sans-serif;font-size:13px;color:#374151;white-space:nowrap;">' + (v.conv !== null ? v.conv.toLocaleString() : "\u2014") + '</td>'
        + '<td style="padding:0px 16px;text-align:right;font-family:Oxygen,sans-serif;font-size:13px;color:#374151;white-space:nowrap;">' + (v.cr || "\u2014") + '</td>'
        + '<td style="padding:0px 16px;text-align:right;white-space:nowrap;">' + lb(v.imp, vi % 4) + '</td>'
        + '<td style="padding:0px 16px;text-align:right;white-space:nowrap;">'
        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">'
        + dots
        + '<span style="font-family:Oxygen,sans-serif;font-size:11px;color:#9ca3af;">' + (v.conf !== null ? v.conf.toFixed(1) + "%" : "\u2014") + '</span>'
        + '</div>'
        + '</td>'
        + revCells
        + '</tr>';
    });

    // Build header
    var baseHeaders = ["Variation", convCol, "CR", "Lift", "Confidence"];
    var revHeaders = hasRevenue ? ["Revenue", "\u0394 Rev", "AOV", "\u0394 AOV"] : [];
    var allHeaders = baseHeaders.concat(revHeaders.length ? [""].concat(revHeaders) : []);

    var headerHtml = allHeaders.map(function (h, i) {
      var isDiv = (h === "" && hasRevenue);
      if (isDiv) return '<th style="padding:0;width:1px;"><div style="width:1px;background:#cbd5e1;margin:0 4px;height:100%;"></div></th>';
      var isRev = hasRevenue && i >= baseHeaders.length + 1;
      var bg = isRev ? "#f8fafc" : "#f8fafc";
      return '<th style="padding:8px 16px;text-align:' + (i === 0 ? "left" : "right") + ';font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;background:' + bg + ';white-space:nowrap;">' + esc(h) + '</th>';
    }).join("");

    var mw = (typeof cardIndex === 'number' && cardIndex < 3) ? 'max-width:65%;' : '';
    return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);flex-shrink:0;' + mw + '">'
      + '<div style="padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:18px;">' + icon + '</span>'
      + '<span style="font-size:15px;font-weight:700;color:#0f172a;">' + esc(goal.name) + '</span>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse;table-layout:auto;">'
      + '<thead><tr style="border-bottom:2px solid #e2e8f0;">' + headerHtml + '</tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
      + '</div>';
  }

  function doRefresh() {
    var body = document.getElementById(ID + "-body");
    var ts = document.getElementById(ID + "-ts");
    if (!body) return;
    var goals = parseTables();
    // Fetch revenue data for purchase/subscription goals
    var revPromises = goals.map(function (g) {
      if (isRevenueGoal(g.name)) {
        return fetchRevenueData(g.tableIndex).then(function (rows) { g.revenueRows = rows; });
      }
      return Promise.resolve();
    });
    Promise.all(revPromises).then(function () {
      body.innerHTML = goals.map(function (g, gi) { return renderCard(g, gi); }).join('<div style="height:12px;"></div>');
      if (ts) ts.textContent = "Updated " + new Date().toLocaleTimeString();
    });
  }

  function buildOverlay(goals, meta) {
    var cards = goals.map(function (g, gi) { return renderCard(g, gi); }).join('<div style="height:12px;"></div>');
    var names = goals[0] && goals[0].variations ? goals[0].variations.map(function (v) { return v.name; }) : [];
    var legend = names.map(function (n, i) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#374151;font-weight:500;">'
        + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + VC[i % 4].border + ';"></span>' + esc(n) + '</span>';
    }).join("");

    var ov = document.createElement("div");
    ov.id = ID;
    ov.style.cssText = "position:fixed;top:0;margin-top:300px !important;left:0;right:0;bottom:0;z-index:100000;background:#f1f5f9;display:flex;flex-direction:column;font-family:Oxygen,sans-serif;overflow:hidden;opacity:0;transform:translateY(8px);transition:opacity 0.2s ease,transform 0.2s ease;";

    ov.innerHTML = '<div style="padding:14px 28px;background:#0f172a;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.25);">'
      + '<div style="display:flex;align-items:center;gap:14px;">'
      + '<div style="display:flex;gap:5px;">'
      + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38bdf8;"></span>'
      + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#a855f7;"></span>'
      + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#db2777;"></span>'
      + '</div>'
      + '<span style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Signal</span>'
      + '<span style="font-size:12px;color:#94a3b8;font-weight:400;">' + esc(meta.name || "Report") + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:20px;">'
      + (meta.days ? '<span style="font-size:12px;color:#94a3b8;"><b style="color:#e2e8f0;font-family:Oxygen,sans-serif;">' + meta.days + '</b> days</span>' : "")
      + (meta.users ? '<span style="font-size:12px;color:#94a3b8;"><b style="color:#e2e8f0;font-family:Oxygen,sans-serif;">' + meta.users + '</b> users</span>' : "")
      + (meta.conv ? '<span style="font-size:12px;color:#94a3b8;"><b style="color:#e2e8f0;font-family:Oxygen,sans-serif;">' + meta.conv + '</b> conv.</span>' : "")
      + '<div style="width:1px;height:20px;background:#334155;"></div>'
      + '<button id="' + ID + '-refresh" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;font-family:Oxygen,sans-serif;">\u21bb Refresh</button>'
      + '<button id="' + ID + '-close" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:16px;border-radius:6px;cursor:pointer;">\u00d7</button>'
      + '</div>'
      + '</div>'
      + '<div style="padding:10px 28px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:20px;flex-wrap:wrap;flex-shrink:0;">'
      + legend
      + '<span id="' + ID + '-ts" style="margin-left:auto;font-size:11px;color:#94a3b8;font-family:Oxygen,sans-serif;">Live data</span>'
      + '</div>'
      + '<div id="' + ID + '-body" style="overflow-y:auto;padding:20px 28px;flex:1;display:flex;flex-direction:column;gap:12px;">'
      + (cards || '<p style="color:#94a3b8;font-size:14px;text-align:center;padding:40px;">No goal data found on this page.</p>')
      + '</div>'
      + '<div style="padding:8px 28px;background:#fff;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
      + '<span style="font-size:10px;color:#cbd5e1;font-family:Oxygen,sans-serif;">signal v1.2</span>'
      + '<span style="font-size:11px;color:#94a3b8;">PDP \u2192 ATC \u2192 Checkout \u2192 Purchase \u2192 Subscription</span>'
      + '</div>';

    return ov;
  }

  // --- Main ---
  var ex = document.getElementById(ID);
  if (ex) { ex.remove(); document.body.style.overflow = ""; return; }

  if (!document.getElementById("sg-fonts")) {
    var lnk = document.createElement("link");
    lnk.id = "sg-fonts"; lnk.rel = "stylesheet"; lnk.href = FONTS;
    document.head.appendChild(lnk);
  }

  var goals = parseTables();
  var meta = parseMeta();

  // Fetch revenue data for purchase/subscription goals before rendering
  var revPromises = goals.map(function (g) {
    if (isRevenueGoal(g.name)) {
      return fetchRevenueData(g.tableIndex).then(function (rows) { g.revenueRows = rows; });
    }
    return Promise.resolve();
  });

  Promise.all(revPromises).then(function () {
    var ov = buildOverlay(goals, meta);
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";

    document.getElementById(ID + "-refresh").addEventListener("click", doRefresh);
    document.getElementById(ID + "-close").addEventListener("click", function () {
      ov.remove(); document.body.style.overflow = "";
      if (typeof popObserver !== "undefined") popObserver.disconnect();
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.style.opacity = "1";
        ov.style.transform = "translateY(0)";
      });
    });

    // Ensure Convert's own dropdowns/popovers always appear above our overlay
    var popObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          var cls = (node.className || "").toString();
          var role = (node.getAttribute && node.getAttribute("role")) || "";
          var isPopover = role === "listbox" || role === "menu" || role === "tooltip" || role === "dialog"
            || cls.indexOf("popover") !== -1 || cls.indexOf("dropdown") !== -1
            || cls.indexOf("tooltip") !== -1 || cls.indexOf("menu") !== -1
            || cls.indexOf("select") !== -1 || cls.indexOf("modal") !== -1
            || cls.indexOf("overlay") !== -1;
          var isBodyChild = node.parentElement === document.body;
          if ((isPopover || isBodyChild) && node.id !== ID) {
            var currentZ = parseInt(window.getComputedStyle(node).zIndex);
            if (isNaN(currentZ) || currentZ <= 100000) {
              node.style.zIndex = "200000";
            }
          }
        });
      });
    });
    popObserver.observe(document.body, { childList: true, subtree: true });
  });

})();
