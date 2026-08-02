  const id = new URLSearchParams(location.search).get("id");
  location.replace("palworld_map.html?view=missions" + (id ? "&id=" + encodeURIComponent(id) : ""));
