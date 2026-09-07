const MODULE_ID = "ffxiv-ttrpg-rulebook-compendia";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "rulebookFolderVersion", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
});

Hooks.once("ready", async () => {
  if (game.users.activeGM?.id !== game.user.id) return;
  if (game.settings.get(MODULE_ID, "rulebookFolderVersion") >= 3) return;

  try {
    const layout = [...game.modules.get(MODULE_ID).packFolders][0];
    const sourceFolders = new Set();
    const destinationFolders = new Set();
    const groups = [...layout.folders];
    const packNames = [
      ...layout.packs,
      ...groups.flatMap(group => [...group.packs]),
    ];
    for (const name of packNames) {
      const pack = game.packs.get(`${MODULE_ID}.${name}`);
      if (!pack) throw new Error(`Missing compendium: ${name}`);
      const folderId = pack.folder?.id ?? pack.config.folder;
      if (folderId) sourceFolders.add(folderId);
    }
    let root = game.folders.find(
      folder => folder.type === "Compendium" && !folder.folder && folder.name === layout.name,
    ) ?? game.folders.find(folder => folder.type === "Compendium" && folder.name === layout.name);
    if (!root) {
      root = await Folder.create({
        name: layout.name,
        type: "Compendium",
        sorting: layout.sorting,
        color: layout.color,
      });
    } else if (root.folder) {
      await root.update({ folder: null });
    }
    destinationFolders.add(root.id);

    for (const [index, name] of [...layout.packs].entries()) {
      const pack = game.packs.get(`${MODULE_ID}.${name}`);
      if (!pack) throw new Error(`Missing compendium: ${name}`);
      await pack.setFolder(root.id);
      await pack.configure({ sort: (index + 1) * 100000 });
    }

    for (const [index, group] of groups.entries()) {
      let folder = game.folders.find(
        folder => folder.type === "Compendium" && folder.folder?.id === root.id && folder.name === group.name,
      ) ?? game.folders.find(folder => folder.type === "Compendium" && folder.name === group.name);
      if (!folder) {
        folder = await Folder.create({
          name: group.name,
          type: "Compendium",
          folder: root.id,
          sorting: group.sorting,
          color: group.color,
          sort: (index + 1) * 100000,
        });
      } else {
        await folder.update({
          folder: root.id,
          sorting: group.sorting,
          color: group.color,
          sort: (index + 1) * 100000,
        });
      }
      destinationFolders.add(folder.id);
      for (const [index, name] of [...group.packs].entries()) {
        const pack = game.packs.get(`${MODULE_ID}.${name}`);
        if (!pack) throw new Error(`Missing compendium: ${name}`);
        await pack.setFolder(folder.id);
        await pack.configure({ sort: (index + 1) * 100000 });
      }
    }

    for (const id of sourceFolders) {
      if (destinationFolders.has(id)) continue;
      const folder = game.folders.get(id);
      if (!folder || folder.type !== "Compendium") continue;
      const hasPacks = [...game.packs.values()].some(
        pack => (pack.folder?.id ?? pack.config.folder) === folder.id,
      );
      const hasFolders = game.folders.some(child => child.folder?.id === folder.id);
      if (!hasPacks && !hasFolders) await folder.delete();
    }

    await game.settings.set(MODULE_ID, "rulebookFolderVersion", 3);
  } catch (error) {
    console.error(`${MODULE_ID} | Compendium folder migration failed`, error);
    ui.notifications.error("Rulebook compendium folders could not be updated. See the console for details.");
  }
});
