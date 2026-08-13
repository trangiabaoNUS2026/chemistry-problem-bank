// ---------------------------------------------------------------------
// Chemistry Olympiad Problem Catalog — app.js
// Vanilla JS, no build step. Fetches data/problems.json + data/taxonomy.json,
// renders a filterable table, and drives a reusable PDF-viewer modal.
// ---------------------------------------------------------------------

(function () {
  "use strict";

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------
  var allProblems = [];        // full dataset, unfiltered
  var taxonomy = { olympiads: [], subsets: [], types: [] };

  // Multi-select field config: key -> Set of currently checked values
  var multiSelectState = {
    subset: new Set(),
    theme: new Set(),
    skills: new Set(),
    target_molecules: new Set()
  };

  // -----------------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------------
  var el = {
    tbody: document.getElementById("problems-tbody"),
    resultsCount: document.getElementById("results-count"),
    emptyState: document.getElementById("empty-state"),
    tableWrapper: document.querySelector(".table-wrapper"),
    clearBtn: document.getElementById("clear-filters-btn"),

    filterId: document.getElementById("filter-id"),
    filterTitle: document.getElementById("filter-title"),
    filterNation: document.getElementById("filter-nation"),
    filterOlympiad: document.getElementById("filter-olympiad"),
    filterYear: document.getElementById("filter-year"),
    filterType: document.getElementById("filter-type"),

    modalOverlay: document.getElementById("modal-overlay"),
    modal: document.querySelector(".modal"),
    modalTitle: document.getElementById("modal-title"),
    modalClose: document.getElementById("modal-close"),
    modalIframe: document.getElementById("modal-iframe")
  };

  var multiSelectConfig = [
    { key: "subset", containerId: "multi-subset", label: "subsets" },
    { key: "theme", containerId: "multi-theme", label: "themes" },
    { key: "skills", containerId: "multi-skills", label: "skills" },
    { key: "target_molecules", containerId: "multi-target_molecules", label: "molecules" }
  ];

  // -----------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------
  function loadData() {
    Promise.all([
      fetch("data/problems.json").then(handleFetchResponse),
      fetch("data/taxonomy.json").then(handleFetchResponse)
    ])
      .then(function (results) {
        allProblems = Array.isArray(results[0]) ? results[0] : [];
        taxonomy = results[1] || { olympiads: [], subsets: [], types: [] };

        populateStaticFilterOptions();
        populateDynamicFilterOptions();
        populateMultiSelects();
        attachFilterListeners();
        attachModalListeners();
        renderTable(allProblems);
      })
      .catch(function (err) {
        showLoadError(err);
      });
  }

  function handleFetchResponse(response) {
    if (!response.ok) {
      throw new Error("Failed to load " + response.url + " (" + response.status + ")");
    }
    return response.json();
  }

  function showLoadError(err) {
    console.error("Catalog data failed to load:", err);
    if (el.tableWrapper) el.tableWrapper.hidden = true;
    el.emptyState.hidden = false;
    el.emptyState.textContent =
      "Could not load the problem catalog data. Please try refreshing the page.";
    el.resultsCount.textContent = "0 results";
  }

  // -----------------------------------------------------------------
  // Filter option population
  // -----------------------------------------------------------------

  // Olympiad + Type come from taxonomy.json
  function populateStaticFilterOptions() {
    fillSelect(el.filterOlympiad, taxonomy.olympiads || []);
    fillSelect(el.filterType, taxonomy.types || []);
  }

  // Nation + Year are derived dynamically from the actual data
  function populateDynamicFilterOptions() {
    var nations = distinctValues(allProblems, "nation");
    var years = distinctValues(allProblems, "year").sort(function (a, b) {
      return a - b;
    });
    fillSelect(el.filterNation, nations);
    fillSelect(el.filterYear, years);
  }

  function fillSelect(selectEl, values) {
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      selectEl.appendChild(opt);
    });
  }

  // Returns sorted distinct values of a scalar field across problems
  function distinctValues(problems, field) {
    var set = new Set();
    problems.forEach(function (p) {
      if (p[field] !== undefined && p[field] !== null && p[field] !== "") {
        set.add(p[field]);
      }
    });
    return Array.from(set).sort();
  }

  // Returns sorted distinct values of an array field across problems
  function distinctArrayValues(problems, field) {
    var set = new Set();
    problems.forEach(function (p) {
      var arr = p[field];
      if (Array.isArray(arr)) {
        arr.forEach(function (v) {
          if (v) set.add(v);
        });
      }
    });
    return Array.from(set).sort();
  }

  // -----------------------------------------------------------------
  // Multi-select popovers (Subset / Theme / Skills / Target Molecule)
  // -----------------------------------------------------------------
  function populateMultiSelects() {
    multiSelectConfig.forEach(function (cfg) {
      var container = document.getElementById(cfg.containerId);
      var panel = container.querySelector(".multi-select-panel");
      var toggle = container.querySelector(".multi-select-toggle");

      var options =
        cfg.key === "subset"
          ? (taxonomy.subsets || [])
          : distinctArrayValues(allProblems, cfg.key);

      options.forEach(function (value) {
        var id = "opt-" + cfg.key + "-" + slug(value);

        var wrapper = document.createElement("label");
        wrapper.className = "multi-select-option";
        wrapper.setAttribute("for", id);

        var checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = id;
        checkbox.value = value;

        checkbox.addEventListener("change", function () {
          if (checkbox.checked) {
            multiSelectState[cfg.key].add(value);
          } else {
            multiSelectState[cfg.key].delete(value);
          }
          updateMultiSelectToggleLabel(cfg, toggle);
          applyFilters();
        });

        var text = document.createTextNode(" " + value);

        wrapper.appendChild(checkbox);
        wrapper.appendChild(text);
        panel.appendChild(wrapper);
      });

      // Toggle popover open/closed
      toggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = !panel.hidden;
        closeAllMultiSelectPanels();
        panel.hidden = isOpen; // if it was open, this closes it; if closed, leaves closed then we reopen below
        if (!isOpen) panel.hidden = false;
      });
    });

    // Close any open popover on outside click
    document.addEventListener("click", function (e) {
      multiSelectConfig.forEach(function (cfg) {
        var container = document.getElementById(cfg.containerId);
        if (!container.contains(e.target)) {
          container.querySelector(".multi-select-panel").hidden = true;
        }
      });
    });
  }

  function closeAllMultiSelectPanels() {
    multiSelectConfig.forEach(function (cfg) {
      document
        .getElementById(cfg.containerId)
        .querySelector(".multi-select-panel").hidden = true;
    });
  }

  function updateMultiSelectToggleLabel(cfg, toggle) {
    var count = multiSelectState[cfg.key].size;
    toggle.textContent = count === 0 ? "All " + cfg.label : count + " " + cfg.label + " selected";
  }

  function slug(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // -----------------------------------------------------------------
  // Filter listeners
  // -----------------------------------------------------------------
  function attachFilterListeners() {
    [el.filterId, el.filterTitle].forEach(function (input) {
      input.addEventListener("input", applyFilters);
    });
    [el.filterNation, el.filterOlympiad, el.filterYear, el.filterType].forEach(function (sel) {
      sel.addEventListener("change", applyFilters);
    });
    el.clearBtn.addEventListener("click", clearAllFilters);
  }

  function clearAllFilters() {
    el.filterId.value = "";
    el.filterTitle.value = "";
    el.filterNation.value = "";
    el.filterOlympiad.value = "";
    el.filterYear.value = "";
    el.filterType.value = "";

    multiSelectConfig.forEach(function (cfg) {
      multiSelectState[cfg.key].clear();
      var container = document.getElementById(cfg.containerId);
      container.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = false;
      });
      updateMultiSelectToggleLabel(cfg, container.querySelector(".multi-select-toggle"));
    });

    applyFilters();
  }

  // -----------------------------------------------------------------
  // Core filter-matching logic
  // -----------------------------------------------------------------
  // A problem matches the active filter set if it satisfies EVERY
  // active field (AND across fields). For a multi-value field (e.g.
  // Subset), the problem matches that field if it contains AT LEAST
  // ONE of the selected values (OR within the field).
  //
  // To add a new filter field later:
  //   - scalar dropdown -> add a simple equality check below
  //   - text field -> add a substring check
  //   - multi-select -> add an "any value in problem's array field
  //     is present in the selected Set" check
  function problemMatchesFilters(problem, filters) {
    // --- text filters (substring, case-insensitive) ---
    if (filters.id && !String(problem.id || "").toLowerCase().includes(filters.id)) {
      return false;
    }
    if (filters.title && !String(problem.title || "").toLowerCase().includes(filters.title)) {
      return false;
    }

    // --- single-value dropdown filters (exact match) ---
    if (filters.nation && String(problem.nation) !== filters.nation) return false;
    if (filters.olympiad && String(problem.olympiad) !== filters.olympiad) return false;
    if (filters.year && String(problem.year) !== filters.year) return false;
    if (filters.type && String(problem.type) !== filters.type) return false;

    // --- multi-select filters (OR within field, field itself is AND'd in) ---
    for (var i = 0; i < multiSelectConfig.length; i++) {
      var cfg = multiSelectConfig[i];
      var selected = multiSelectState[cfg.key];
      if (selected.size === 0) continue; // no filter active for this field

      var problemValues = Array.isArray(problem[cfg.key]) ? problem[cfg.key] : [];
      var hasAnyMatch = problemValues.some(function (v) {
        return selected.has(v);
      });
      if (!hasAnyMatch) return false;
    }

    return true;
  }

  function getActiveFilters() {
    return {
      id: el.filterId.value.trim().toLowerCase(),
      title: el.filterTitle.value.trim().toLowerCase(),
      nation: el.filterNation.value,
      olympiad: el.filterOlympiad.value,
      year: el.filterYear.value,
      type: el.filterType.value
    };
  }

  function applyFilters() {
    var filters = getActiveFilters();
    var filtered = allProblems.filter(function (p) {
      return problemMatchesFilters(p, filters);
    });
    renderTable(filtered);
  }

  // -----------------------------------------------------------------
  // Table rendering
  // -----------------------------------------------------------------
  function renderTable(problems) {
    el.resultsCount.textContent = problems.length + " results";

    if (problems.length === 0) {
      el.tbody.innerHTML = "";
      if (el.tableWrapper) el.tableWrapper.hidden = true;
      el.emptyState.hidden = false;
      el.emptyState.textContent = "No problems match these filters.";
      return;
    }

    if (el.tableWrapper) el.tableWrapper.hidden = false;
    el.emptyState.hidden = true;

    // Build all rows as a single HTML string, then assign once — avoids
    // repeated DOM mutation for large datasets.
    var rowsHtml = problems.map(buildRowHtml).join("");
    el.tbody.innerHTML = rowsHtml;

    // Wire up action buttons after the batch DOM write.
    el.tbody.querySelectorAll("[data-action='view-problem']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openModalForButton(btn, "problem");
      });
    });
    el.tbody.querySelectorAll("[data-action='view-solution']").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openModalForButton(btn, "solution");
      });
    });
  }

  function buildRowHtml(problem) {
    var subsetChips = (problem.subset || [])
      .map(function (s) {
        return '<span class="chip">' + escapeHtml(s) + "</span>";
      })
      .join("");

    var hasProblemPdf = !!problem.problem_pdf;
    var hasSolutionPdf = !!problem.solution_pdf;

    var problemBtn = hasProblemPdf
      ? '<button type="button" class="btn" data-action="view-problem" data-id="' +
        escapeHtml(problem.id) +
        '">View Problem</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Problem</button>';

    var solutionBtn = hasSolutionPdf
      ? '<button type="button" class="btn" data-action="view-solution" data-id="' +
        escapeHtml(problem.id) +
        '">View Solution</button>'
      : '<button type="button" class="btn btn-disabled" disabled>View Solution</button>';

    return (
      "<tr>" +
      '<td class="cell-id" data-label="ID">' + escapeHtml(problem.id) + "</td>" +
      '<td data-label="Title">' + escapeHtml(problem.title) + "</td>" +
      '<td data-label="Nation">' + escapeHtml(problem.nation) + "</td>" +
      '<td data-label="Olympiad">' + escapeHtml(problem.olympiad) + "</td>" +
      '<td class="cell-year" data-label="Year">' + escapeHtml(problem.year) + "</td>" +
      '<td data-label="Subset"><span class="chip-row">' + subsetChips + "</span></td>" +
      '<td data-label="Type">' + escapeHtml(problem.type) + "</td>" +
      '<td class="actions-cell" data-label="Actions">' + problemBtn + solutionBtn + "</td>" +
      "</tr>"
    );
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // -----------------------------------------------------------------
  // PDF modal
  // -----------------------------------------------------------------
  var lastFocusedElement = null;

  function openModalForButton(btn, kind) {
    var id = btn.getAttribute("data-id");
    var problem = allProblems.find(function (p) {
      return p.id === id;
    });
    if (!problem) return;

    var file = kind === "problem" ? problem.problem_pdf : problem.solution_pdf;
    var page = kind === "problem" ? problem.problem_page : problem.solution_page;
    if (!file) return; // shouldn't happen since disabled buttons have no handler

    var src = "viewer.html?file=" + encodeURIComponent(file);
    if (page) src += "#page=" + encodeURIComponent(page);
    
    el.modalTitle.textContent =
      problem.id + " — " + problem.title + (kind === "solution" ? " (Solution)" : "");
    
    lastFocusedElement = document.activeElement;
    el.modalOverlay.hidden = false;   // show the modal FIRST, at full real size...
    el.modalIframe.src = src;          // ...THEN start loading the PDF into it
    el.modalClose.focus();
  }

  function closeModal() {
    el.modalOverlay.hidden = true;
    el.modalIframe.src = "about:blank";
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function attachModalListeners() {
    el.modalClose.addEventListener("click", closeModal);

    // Close on overlay click, but not on clicks inside the modal itself.
    el.modalOverlay.addEventListener("click", function (e) {
      if (e.target === el.modalOverlay) {
        closeModal();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !el.modalOverlay.hidden) {
        closeModal();
      }
    });
  }

  // -----------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", loadData);
})();
