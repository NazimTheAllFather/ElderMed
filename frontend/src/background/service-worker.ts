chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Older Chrome builds may not support setPanelBehavior.
  });
