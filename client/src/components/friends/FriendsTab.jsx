import { useState, useEffect } from "react";
import { DIST_TIERS } from "../../lib/constants.js";
import { flakeStats, effectiveLastHang, recencyBadge, daysSince } from "../../lib/helpers.js";
import { scoreFor } from "../../lib/scoring.js";
import { Pill, StatusPill } from "../ui/Pill.jsx";
import { ScoreDisplay } from "../ui/ScoreDisplay.jsx";
import { api, capabilities } from "../../lib/api/index.js";
import { CalendarAuditPanel } from "./CalendarAuditPanel.jsx";
import {
  rankedOrder,
  reRank,
  startComparisonSession,
  buildRankingWrites,
  RANKED_ATTRS,
  reorder,
} from "../../lib/ranking.js";
import { RankSession } from "./RankSession.jsx";
import { SeedRound } from "./SeedRound.jsx";
import { getEncMeta, saveEncMeta, deleteEncMeta } from "../../lib/api/db.js";
import {
  buildEncMeta,
  unlockWithMeta,
  isUnlocked,
  lock,
  encryptFriend,
  decryptFriend,
  encryptEvent,
  decryptEvent,
} from "../../lib/crypto.js";

export function FriendsTab({
  friends,
  events,
  activities = [],
  onUpdate,
  onEdit,
  onDelete,
  onCalendarSync,
  onBatchRankUpdate,
}) {
  const getLS = (key, def) => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  };
  const [search, setSearch] = useState("");
  const VALID_SORTS = new Set(["name", "wat", "lastHang", "overdue"]);
  const [sortBy, setSortBy] = useState(() => {
    const v = getLS("fr_sortBy", "wat");
    return VALID_SORTS.has(v) ? v : "wat";
  });
  const [sortDir, setSortDir] = useState(() => getLS("fr_sortDir", "desc"));
  const [grp, setGrp] = useState(() => getLS("fr_grp", "All"));
  const [tag, setTag] = useState(() => getLS("fr_tag", "All"));
  const [statusFilter, setStatusFilter] = useState(() => getLS("fr_statusFilter", "All"));
  const [confirmId, setConfirmId] = useState(null);
  const [showActive, setShowActive] = useState(() => getLS("fr_showActive", true));
  const [showArchived, setShowArchived] = useState(() => getLS("fr_showArchived", false));
  const [syncMsg, setSyncMsg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [calMsg, setCalMsg] = useState(null);
  const [rankingFriendId, setRankingFriendId] = useState(null); // id of friend being ranked inline
  const [showSeedRound, setShowSeedRound] = useState(false);
  const [calAudit, setCalAudit] = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);
  const [encMsg, setEncMsg] = useState(null);
  const [encPanel, setEncPanel] = useState(null); // null | "enable" | "change" | "disable"
  const [encPhrase, setEncPhrase] = useState("");
  const [encConfirm, setEncConfirm] = useState("");
  const [encBusy, setEncBusy] = useState(false);
  const [encEnabled, setEncEnabled] = useState(false);
  useEffect(() => {
    if (!capabilities.server) getEncMeta().then((m) => setEncEnabled(!!m));
  }, []);
  const [showGroups, setShowGroups] = useState(() => getLS("fr_showGroups", false));
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showTags, setShowTags] = useState(() => getLS("fr_showTags", false));
  const [expandedTag, setExpandedTag] = useState(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState(null);
  const [renamingTag, setRenamingTag] = useState(null);
  const [renameTagValue, setRenameTagValue] = useState("");
  const [rankMode, setRankMode] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dropBefore, setDropBefore] = useState(true);

  useEffect(() => {
    localStorage.setItem("fr_sortBy", JSON.stringify(sortBy));
  }, [sortBy]);
  useEffect(() => {
    localStorage.setItem("fr_sortDir", JSON.stringify(sortDir));
  }, [sortDir]);
  useEffect(() => {
    localStorage.setItem("fr_grp", JSON.stringify(grp));
  }, [grp]);
  useEffect(() => {
    localStorage.setItem("fr_tag", JSON.stringify(tag));
  }, [tag]);
  useEffect(() => {
    localStorage.setItem("fr_statusFilter", JSON.stringify(statusFilter));
  }, [statusFilter]);
  useEffect(() => {
    localStorage.setItem("fr_showActive", JSON.stringify(showActive));
  }, [showActive]);
  useEffect(() => {
    localStorage.setItem("fr_showArchived", JSON.stringify(showArchived));
  }, [showArchived]);
  useEffect(() => {
    localStorage.setItem("fr_showGroups", JSON.stringify(showGroups));
  }, [showGroups]);
  useEffect(() => {
    localStorage.setItem("fr_showTags", JSON.stringify(showTags));
  }, [showTags]);

  const handleSyncApple = async () => {
    setSyncMsg("Syncing...");
    try {
      const result = await api.syncAppleContacts();
      setSyncMsg(`Matched ${result.matched ?? 0} · Unmatched ${result.unmatched ?? 0}`);
      setTimeout(() => setSyncMsg(null), 4000);
    } catch (e) {
      setSyncMsg("Sync failed");
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  const connectGoogle = () =>
    new Promise((resolve, reject) => {
      const popup = window.open(
        "/api/auth/google",
        "google-auth",
        "width=500,height=650,left=200,top=100"
      );
      const onMsg = (e) => {
        if (e.data?.type !== "google-auth-complete") return;
        window.removeEventListener("message", onMsg);
        clearInterval(poll);
        resolve(e.data.email);
      };
      window.addEventListener("message", onMsg);
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          // Wait a tick for any queued postMessage to arrive before rejecting
          setTimeout(() => {
            window.removeEventListener("message", onMsg);
            reject(new Error("closed"));
          }, 300);
        }
      }, 500);
    });

  const handleConfirmHang = async (friendId, date) => {
    const result = await api.confirmCalendarHang(friendId, date);
    onCalendarSync?.([result]);
  };

  const handleImportCalendar = async () => {
    setImporting(true);
    setCalMsg(null);
    setCalAudit(null);
    try {
      let result = await api.importCalendarHangs().catch(async (e) => {
        if (e.status !== 401) throw e;
        setCalMsg("Connecting Google…");
        await connectGoogle();
        setCalMsg(null);
        return api.importCalendarHangs();
      });
      if (result.matched > 0) onCalendarSync?.(result.updated);
      setCalMsg(
        result.matched > 0
          ? `${result.matched} new hang${result.matched === 1 ? "" : "s"} found across ${result.scanned} events`
          : `Up to date — scanned ${result.scanned} events`
      );
      setCalAudit({
        matchedEvents: result.matchedEvents ?? [],
        unmatchedEvents: result.unmatchedEvents ?? [],
        reviewEvents: result.reviewEvents ?? [],
      });
      setTimeout(() => setCalMsg(null), 8000);
    } catch (e) {
      setCalMsg(e.message === "closed" ? "Sign-in cancelled" : "Sync failed");
      setTimeout(() => setCalMsg(null), 4000);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `friend-radar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg("Backup downloaded ✓");
      setTimeout(() => setBackupMsg(null), 3000);
    } catch (e) {
      setBackupMsg("Export failed");
      setTimeout(() => setBackupMsg(null), 3000);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await api.importData(json);
      setBackupMsg("Backup restored — reload to see your data");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setBackupMsg(err.message?.includes("version") ? "Invalid backup file" : "Import failed");
      setTimeout(() => setBackupMsg(null), 4000);
    }
  };

  // ── Encryption management (local mode only) ────────────────────────────────

  const resetEncForm = () => {
    setEncPhrase("");
    setEncConfirm("");
    setEncMsg(null);
  };

  const handleEnableEncryption = async (e) => {
    e.preventDefault();
    if (encPhrase !== encConfirm) {
      setEncMsg("Passphrases don't match.");
      return;
    }
    setEncBusy(true);
    setEncMsg(null);
    try {
      const meta = await buildEncMeta(encPhrase);
      await saveEncMeta(meta);
      // Re-encrypt all current data
      const db = (await import("../../lib/api/db.js")).getLocalDb
        ? await (await import("../../lib/api/db.js")).getLocalDb()
        : null;
      if (db) {
        const [allFriends, allEvents] = await Promise.all([
          db.getAll("friends"),
          db.getAll("events"),
        ]);
        for (const f of allFriends) await db.put("friends", await encryptFriend(f));
        for (const ev of allEvents) await db.put("events", await encryptEvent(ev));
      }
      setEncEnabled(true);
      localStorage.removeItem("fr:enc-declined");
      setEncPanel(null);
      resetEncForm();
      setEncMsg("Encryption enabled ✓");
      setTimeout(() => setEncMsg(null), 3000);
    } catch (err) {
      setEncMsg(err.message ?? "Failed to enable encryption.");
    } finally {
      setEncBusy(false);
    }
  };

  const handleChangePassphrase = async (e) => {
    e.preventDefault();
    if (encPhrase !== encConfirm) {
      setEncMsg("Passphrases don't match.");
      return;
    }
    setEncBusy(true);
    setEncMsg(null);
    try {
      // Decrypt everything with current key, then re-encrypt with new passphrase
      const db = await (await import("../../lib/api/db.js")).getLocalDb();
      const [allFriends, allEvents] = await Promise.all([
        db.getAll("friends"),
        db.getAll("events"),
      ]);
      const decFriends = await Promise.all(allFriends.map(decryptFriend));
      const decEvents = await Promise.all(allEvents.map(decryptEvent));
      // Build new meta (sets the new active key)
      const meta = await buildEncMeta(encPhrase);
      await saveEncMeta(meta);
      for (const f of decFriends) await db.put("friends", await encryptFriend(f));
      for (const ev of decEvents) await db.put("events", await encryptEvent(ev));
      setEncPanel(null);
      resetEncForm();
      setEncMsg("Passphrase updated ✓");
      setTimeout(() => setEncMsg(null), 3000);
    } catch (err) {
      setEncMsg(err.message ?? "Failed to change passphrase.");
    } finally {
      setEncBusy(false);
    }
  };

  const handleDisableEncryption = async (e) => {
    e.preventDefault();
    setEncBusy(true);
    setEncMsg(null);
    try {
      const meta = await getEncMeta();
      const ok = await unlockWithMeta(encPhrase, meta);
      if (!ok) {
        setEncMsg("Incorrect passphrase.");
        setEncBusy(false);
        return;
      }
      // Decrypt all records back to plaintext
      const db = await (await import("../../lib/api/db.js")).getLocalDb();
      const [allFriends, allEvents] = await Promise.all([
        db.getAll("friends"),
        db.getAll("events"),
      ]);
      const decFriends = await Promise.all(allFriends.map(decryptFriend));
      const decEvents = await Promise.all(allEvents.map(decryptEvent));
      lock();
      await deleteEncMeta();
      for (const f of decFriends) await db.put("friends", f);
      for (const ev of decEvents) await db.put("events", ev);
      setEncEnabled(false);
      setEncPanel(null);
      resetEncForm();
      setEncMsg("Encryption disabled.");
      setTimeout(() => setEncMsg(null), 3000);
    } catch (err) {
      setEncMsg(err.message ?? "Failed to disable encryption.");
    } finally {
      setEncBusy(false);
    }
  };

  const active = friends.filter((f) => (f.wantAround ?? "active") === "active");
  const inactive = friends.filter((f) => (f.wantAround ?? "active") !== "active");

  const allGroups = [...new Set(friends.flatMap((f) => f.groups ?? []))].sort();
  const allTags = [...new Set(friends.flatMap((f) => f.tags ?? []))].sort();

  const counts = {};
  allGroups.forEach((g) => {
    counts[g] = active.filter((f) => f.groups?.includes(g)).length;
  });
  counts["Other"] = active.filter((f) => !f.groups?.length).length;

  const tagCounts = {};
  allTags.forEach((t) => {
    tagCounts[t] = active.filter((f) => f.tags?.includes(t)).length;
  });

  const STATUSES = ["Prospect", "Acquaintance", "Friend", "Close friend"];
  const statusCounts = {};
  STATUSES.forEach((s) => {
    statusCounts[s] = active.filter((f) => f.status === s).length;
  });

  const q = search.trim().toLowerCase();
  const filtered = active.filter((f) => {
    const grpMatch =
      grp === "All" ? true : grp === "Other" ? !f.groups?.length : f.groups?.includes(grp);
    const tagMatch = tag === "All" ? true : f.tags?.includes(tag);
    const statusMatch = statusFilter === "All" ? true : f.status === statusFilter;
    const searchMatch =
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q) ||
      f.groups?.some((g) => g.toLowerCase().includes(q)) ||
      f.tags?.some((t) => t.toLowerCase().includes(q));
    return grpMatch && tagMatch && statusMatch && searchMatch;
  });

  const watScore = (f) =>
    scoreFor(f, "just-hang", "weekday-evening", events, false, null, activities);

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortBy === "name") {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    } else if (sortBy === "lastHang") {
      const ad = daysSince(effectiveLastHang(a, events));
      const bd = daysSince(effectiveLastHang(b, events));
      av = ad ?? Infinity;
      bv = bd ?? Infinity;
    } else if (sortBy === "overdue") {
      const aHang = effectiveLastHang(a, events);
      const bHang = effectiveLastHang(b, events);
      const aDs = daysSince(aHang);
      const bDs = daysSince(bHang);
      av = a.targetFreqDays ? (aDs ?? 0) - a.targetFreqDays : -Infinity;
      bv = b.targetFreqDays ? (bDs ?? 0) - b.targetFreqDays : -Infinity;
    } else if (sortBy === "wat") {
      av = watScore(a).score;
      bv = watScore(b).score;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const hasAnyRanked = active.some((f) => typeof f.rankings?.reliability === "number");
  const rankModeOrder = rankMode ? rankedOrder(active, "reliability") : [];
  const rankModeFriends = rankMode
    ? rankModeOrder.map((id) => active.find((f) => f.id === id)).filter(Boolean)
    : [];
  const unrankedActive = rankMode
    ? active.filter((f) => typeof f.rankings?.reliability !== "number")
    : [];
  const combinedList = rankMode ? [...rankModeFriends, ...unrankedActive] : [];

  function resetDrag() {
    setDragFromIdx(null);
    setDragOverId(null);
    setDropBefore(true);
  }
  function handleListDragStart(idx) {
    setDragFromIdx(idx);
  }
  function handleListDrop() {
    if (dragFromIdx === null || dragOverId === null) {
      resetDrag();
      return;
    }
    const M = rankModeFriends.length;
    const hoverOrigIdx = combinedList.findIndex((f) => f.id === dragOverId);
    if (hoverOrigIdx < 0) {
      resetDrag();
      return;
    }

    let insertIdx = dropBefore ? hoverOrigIdx : hoverOrigIdx + 1;
    if (dragFromIdx < insertIdx) insertIdx--;
    if (dragFromIdx === insertIdx) {
      resetDrag();
      return;
    }

    const fromRanked = dragFromIdx < M;
    const insertInRanked = insertIdx < M;

    if (fromRanked && insertInRanked) {
      const newOrder = reorder(rankModeOrder, dragFromIdx, insertIdx);
      resetDrag();
      onBatchRankUpdate?.(buildRankingWrites(active, "reliability", newOrder));
    } else if (!fromRanked && insertInRanked) {
      const draggedId = combinedList[dragFromIdx].id;
      const newOrder = [
        ...rankModeOrder.slice(0, insertIdx),
        draggedId,
        ...rankModeOrder.slice(insertIdx),
      ];
      resetDrag();
      onBatchRankUpdate?.(buildRankingWrites(active, "reliability", newOrder));
    } else if (!fromRanked) {
      const draggedId = combinedList[dragFromIdx].id;
      resetDrag();
      onBatchRankUpdate?.(buildRankingWrites(active, "reliability", [...rankModeOrder, draggedId]));
    } else {
      resetDrag();
    }
  }

  const deleteGroup = (name) => {
    friends.forEach((f) => {
      if (f.groups?.includes(name))
        onUpdate(f.id, (x) => ({ ...x, groups: x.groups.filter((g) => g !== name) }));
    });
    if (grp === name) setGrp("All");
    if (expandedGroup === name) setExpandedGroup(null);
  };

  const renameGroup = (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    friends.forEach((f) => {
      if (f.groups?.includes(oldName))
        onUpdate(f.id, (x) => ({
          ...x,
          groups: x.groups.map((g) => (g === oldName ? trimmed : g)),
        }));
    });
    if (grp === oldName) setGrp(trimmed);
    if (expandedGroup === oldName) setExpandedGroup(trimmed);
    setRenamingGroup(null);
    setRenameValue("");
  };

  const moveGroupToTag = (name) => {
    friends.forEach((f) => {
      if (f.groups?.includes(name))
        onUpdate(f.id, (x) => ({
          ...x,
          groups: x.groups.filter((g) => g !== name),
          tags: [...new Set([...(x.tags ?? []), name])],
        }));
    });
    if (grp === name) setGrp("All");
    if (expandedGroup === name) setExpandedGroup(null);
  };

  const toggleMembership = (friendId, groupName) => {
    onUpdate(friendId, (x) => ({
      ...x,
      groups: x.groups?.includes(groupName)
        ? x.groups.filter((g) => g !== groupName)
        : [...(x.groups ?? []), groupName],
    }));
  };

  const moveTagToGroup = (name) => {
    friends.forEach((f) => {
      if (f.tags?.includes(name))
        onUpdate(f.id, (x) => ({
          ...x,
          tags: x.tags.filter((t) => t !== name),
          groups: [...new Set([...(x.groups ?? []), name])],
        }));
    });
    if (expandedTag === name) setExpandedTag(null);
  };

  const deleteTag = (name) => {
    friends.forEach((f) => {
      if (f.tags?.includes(name))
        onUpdate(f.id, (x) => ({ ...x, tags: x.tags.filter((t) => t !== name) }));
    });
    if (expandedTag === name) setExpandedTag(null);
  };

  const renameTag = (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    friends.forEach((f) => {
      if (f.tags?.includes(oldName))
        onUpdate(f.id, (x) => ({ ...x, tags: x.tags.map((t) => (t === oldName ? trimmed : t)) }));
    });
    if (expandedTag === oldName) setExpandedTag(trimmed);
    setRenamingTag(null);
    setRenameTagValue("");
  };

  const toggleTagMembership = (friendId, tagName) => {
    onUpdate(friendId, (x) => ({
      ...x,
      tags: x.tags?.includes(tagName)
        ? x.tags.filter((t) => t !== tagName)
        : [...(x.tags ?? []), tagName],
    }));
  };

  function renderFriendCard(f, dragIdx) {
    const st = flakeStats(f.id, events);
    const lh = effectiveLastHang(f, events);
    const badge = recencyBadge(f.targetFreqDays, lh);
    const tops = Object.entries(f.interests || {})
      .filter(([, v]) => v >= 4)
      .map(([id]) => activities.find((a) => a.id === id)?.label)
      .filter(Boolean)
      .slice(0, 3);
    const distLabel = DIST_TIERS.find((d) => d.id === f.distanceTier)?.label;
    const wat = watScore(f);
    const ds = daysSince(lh);
    const isBusy = !!(f.busyUntil && f.busyUntil >= new Date().toISOString().split("T")[0]);
    const isDraggable = dragIdx !== null;
    const isSource = isDraggable && dragFromIdx === dragIdx;
    return (
      <div
        key={f.id}
        draggable={isDraggable}
        onDragStart={isDraggable ? () => handleListDragStart(dragIdx) : undefined}
        onDragOver={
          isDraggable
            ? (e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                if (dragOverId !== f.id || dropBefore !== before) {
                  setDragOverId(f.id);
                  setDropBefore(before);
                }
              }
            : undefined
        }
        onDrop={isDraggable ? handleListDrop : undefined}
        onDragEnd={isDraggable ? resetDrag : undefined}
        style={{
          background: isSource ? "#f0f9ff" : "#fff",
          borderRadius: 16,
          border: isSource ? "2px dashed #93c5fd" : "1px solid #e5e7eb",
          padding: "14px 15px",
          opacity: isSource ? 0.45 : 1,
          cursor: isDraggable ? "grab" : "default",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          {isDraggable && (
            <span
              style={{
                fontSize: 18,
                color: "#d1d5db",
                userSelect: "none",
                flexShrink: 0,
                alignSelf: "center",
              }}
            >
              ⣿
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{f.name}</span>
              <StatusPill status={f.status} />
              {badge && <Pill text={badge.text} bg={badge.bg} c={badge.c} />}
              {isBusy && <Pill text={`Away until ${f.busyUntil}`} bg="#fef3c7" c="#b45309" />}
              {f.locationPref && f.locationPref !== "either" && (
                <Pill
                  text={f.locationPref === "home" ? "Prefers home" : "Prefers out"}
                  bg="#f0f9ff"
                  c="#0369a1"
                />
              )}
              {st?.flakeRate != null && st.flakeRate > 0.4 && (
                <Pill text={`${Math.round(st.flakeRate * 100)}% flake`} bg="#fee2e2" c="#b91c1c" />
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
              {f.email && <span style={{ fontSize: 11, color: "#6b7280" }}>{f.email}</span>}
              {f.contact && !f.email && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{f.contact}</span>
              )}
              {f.distanceTier !== "nearby" && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>📍 {distLabel}</span>
              )}
            </div>

            {st && st.total > 0 ? (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 8px",
                  background: "#f9fafb",
                  borderRadius: 8,
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  Invited: <strong style={{ color: "#111827" }}>{st.total}×</strong>
                </span>
                {st.yesRate != null && (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    Yes:{" "}
                    <strong style={{ color: "#16a34a" }}>{Math.round(st.yesRate * 100)}%</strong>
                  </span>
                )}
                {st.flakeRate != null && (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    Flake:{" "}
                    <strong style={{ color: st.flakeRate > 0.3 ? "#dc2626" : "#374151" }}>
                      {Math.round(st.flakeRate * 100)}%
                    </strong>{" "}
                    <span style={{ color: "#9ca3af" }}>
                      ({st.flaked}/{st.finYesTotal})
                    </span>
                  </span>
                )}
                {st.ghostedN > 0 && (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>Ghosted {st.ghostedN}×</span>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 5, fontSize: 11, color: "#9ca3af" }}>
                {f.rankings?.reliability != null ? (
                  <>
                    Reliability ranked:{" "}
                    <strong style={{ color: "#4f46e5" }}>
                      {f.rankings.reliability.toFixed(1)}/10
                    </strong>
                  </>
                ) : (
                  <>
                    Reliable: {f.reliability}/5 · Responsive: {f.responsiveness}/5
                  </>
                )}
                {(f.manualFlakes ?? 0) !== 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: "1px 6px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      background: (f.manualFlakes ?? 0) > 0 ? "#fee2e2" : "#dcfce7",
                      color: (f.manualFlakes ?? 0) > 0 ? "#b91c1c" : "#15803d",
                    }}
                  >
                    {(f.manualFlakes ?? 0) > 0
                      ? `+${f.manualFlakes} flake penalty`
                      : `${f.manualFlakes} flake forgiven`}
                  </span>
                )}
                <span style={{ color: "#c7d2fe" }}> — no event history yet</span>
              </div>
            )}

            {tops.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {tops.map((lbl) => (
                  <Pill key={lbl} text={lbl} bg="#eef2ff" c="#4338ca" />
                ))}
              </div>
            )}
            {f.tags?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {f.tags.map((t) => (
                  <Pill key={t} text={t} bg="#fef3c7" c="#b45309" />
                ))}
              </div>
            )}
            {f.notes && (
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, fontStyle: "italic" }}>
                {f.notes}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 5,
                marginTop: 9,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>Away until</span>
              <input
                type="date"
                value={f.busyUntil ?? ""}
                onChange={(e) =>
                  onUpdate(f.id, (x) => ({ ...x, busyUntil: e.target.value || null }))
                }
                style={{
                  padding: "2px 6px",
                  borderRadius: 7,
                  border: "1px solid #e5e7eb",
                  fontSize: 11,
                  color: "#374151",
                  background: isBusy ? "#fef3c7" : "#f9fafb",
                  cursor: "pointer",
                }}
              />
              {isBusy && (
                <button
                  onClick={() => onUpdate(f.id, (x) => ({ ...x, busyUntil: null }))}
                  style={{
                    padding: "2px 7px",
                    borderRadius: 7,
                    fontSize: 11,
                    background: "#f3f4f6",
                    color: "#9ca3af",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => onUpdate(f.id, (x) => ({ ...x, wantAround: "skip" }))}
                style={{
                  padding: "3px 9px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "#fff0f0",
                  color: "#ef4444",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Set as inactive priority
              </button>
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              alignItems: "flex-end",
            }}
          >
            <ScoreDisplay
              score={wat.score}
              willing={wat.willing}
              able={wat.able}
              trust={wat.trust}
              inCooldown={wat.inCooldown}
              daysUntilDue={wat.daysUntilDue}
              isBusyThisWeek={isBusy}
              targetFreqDays={f.targetFreqDays}
              ds={ds}
            />
            {confirmId === f.id ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}
              >
                <span style={{ fontSize: 11, color: "#ef4444" }}>Remove?</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => {
                      onDelete(f.id);
                      setConfirmId(null);
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 700,
                      background: "#fef2f2",
                      color: "#ef4444",
                      border: "1px solid #fca5a5",
                      cursor: "pointer",
                    }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 7,
                      fontSize: 11,
                      background: "#f3f4f6",
                      color: "#6b7280",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setRankingFriendId(f.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: f.rankings?.reliability != null ? "#eff6ff" : "#f0f9ff",
                    color: f.rankings?.reliability != null ? "#1d4ed8" : "#0369a1",
                    border: "none",
                    cursor: "pointer",
                  }}
                  title={
                    f.rankings?.reliability != null
                      ? `Reliability ranked: ${f.rankings.reliability.toFixed(1)}/10`
                      : "Rank reliability"
                  }
                >
                  {f.rankings?.reliability != null
                    ? `★ ${f.rankings.reliability.toFixed(1)}`
                    : "Rank"}
                </button>
                <button
                  onClick={() => onEdit(f)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "#f3f4f6",
                    color: "#6b7280",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmId(f.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "#fef2f2",
                    color: "#ef4444",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <style>{`@keyframes calbar{0%,100%{transform:translateX(-120%)}50%{transform:translateX(240%)}}`}</style>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginBottom: 6,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {capabilities.calendar && (
            <button
              onClick={handleImportCalendar}
              disabled={importing}
              style={{
                padding: "5px 11px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "#f0fdf4",
                color: importing ? "#86efac" : "#15803d",
                border: "1px solid #bbf7d0",
                cursor: importing ? "default" : "pointer",
              }}
            >
              {importing ? (calMsg ? "Waiting…" : "Scanning…") : "Import Calendar Hangs"}
            </button>
          )}
          {capabilities.contacts && (
            <button
              onClick={handleSyncApple}
              style={{
                padding: "5px 11px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "#f0f9ff",
                color: "#0284c7",
                border: "1px solid #bae6fd",
                cursor: "pointer",
              }}
            >
              Sync Apple Contacts
            </button>
          )}
          {syncMsg && <span style={{ fontSize: 11, color: "#6b7280" }}>{syncMsg}</span>}
          <button
            onClick={handleExport}
            style={{
              padding: "5px 11px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: "#f5f3ff",
              color: "#6d28d9",
              border: "1px solid #ddd6fe",
              cursor: "pointer",
            }}
            title="Download a JSON backup of all your data"
          >
            Export backup
          </button>
          <label
            style={{
              padding: "5px 11px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: "#f5f3ff",
              color: "#6d28d9",
              border: "1px solid #ddd6fe",
              cursor: "pointer",
            }}
            title="Restore from a JSON backup"
          >
            Import backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
          </label>
          {backupMsg && (
            <span
              style={{
                fontSize: 11,
                color:
                  backupMsg.includes("failed") || backupMsg.includes("Invalid")
                    ? "#b91c1c"
                    : "#15803d",
              }}
            >
              {backupMsg}
            </span>
          )}
          {!capabilities.server && (
            <>
              <button
                onClick={() => {
                  resetEncForm();
                  setEncPanel(encEnabled ? "change" : "enable");
                }}
                style={{
                  padding: "5px 11px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  background: encEnabled ? "#f0fdf4" : "#fef9c3",
                  color: encEnabled ? "#15803d" : "#854d0e",
                  border: `1px solid ${encEnabled ? "#bbf7d0" : "#fde68a"}`,
                  cursor: "pointer",
                }}
                title={encEnabled ? "Change encryption passphrase" : "Enable data encryption"}
              >
                {encEnabled ? "🔒 Encrypted" : "🔓 Not encrypted"}
              </button>
              {encEnabled && (
                <button
                  onClick={() => {
                    resetEncForm();
                    setEncPanel("disable");
                  }}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "#fff",
                    color: "#6b7280",
                    border: "1px solid #d1d5db",
                    cursor: "pointer",
                  }}
                >
                  Disable encryption
                </button>
              )}
              {encMsg && (
                <span
                  style={{
                    fontSize: 11,
                    color: encMsg.includes("✓") ? "#15803d" : "#b91c1c",
                  }}
                >
                  {encMsg}
                </span>
              )}
            </>
          )}
        </div>

        {/* Encryption management panels */}
        {encPanel === "enable" && (
          <form
            onSubmit={handleEnableEncryption}
            style={{
              marginBottom: 10,
              padding: "12px 14px",
              background: "#fef9c3",
              borderRadius: 10,
              border: "1px solid #fde68a",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>
              Enable encryption
            </div>
            <div style={{ fontSize: 11, color: "#78350f", marginBottom: 10 }}>
              ⚠️ If you forget your passphrase, data cannot be recovered.
            </div>
            <input
              type="password"
              placeholder="Passphrase"
              value={encPhrase}
              onChange={(e) => setEncPhrase(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, marginBottom: 6, boxSizing: "border-box" }}
            />
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={encConfirm}
              onChange={(e) => setEncConfirm(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            {encMsg && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{encMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setEncPanel(null); resetEncForm(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={encBusy || !encPhrase} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: encBusy || !encPhrase ? 0.6 : 1 }}>
                {encBusy ? "Encrypting…" : "Enable"}
              </button>
            </div>
          </form>
        )}

        {encPanel === "change" && (
          <form
            onSubmit={handleChangePassphrase}
            style={{ marginBottom: 10, padding: "12px 14px", background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0" }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 8 }}>Change passphrase</div>
            <input type="password" placeholder="New passphrase" value={encPhrase} onChange={(e) => setEncPhrase(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, marginBottom: 6, boxSizing: "border-box" }} />
            <input type="password" placeholder="Confirm new passphrase" value={encConfirm} onChange={(e) => setEncConfirm(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
            {encMsg && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{encMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setEncPanel(null); resetEncForm(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={encBusy || !encPhrase} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#15803d", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: encBusy || !encPhrase ? 0.6 : 1 }}>
                {encBusy ? "Updating…" : "Update passphrase"}
              </button>
            </div>
          </form>
        )}

        {encPanel === "disable" && (
          <form
            onSubmit={handleDisableEncryption}
            style={{ marginBottom: 10, padding: "12px 14px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>Disable encryption</div>
            <div style={{ fontSize: 11, color: "#7f1d1d", marginBottom: 8 }}>Enter your current passphrase to confirm. Data will be stored unencrypted.</div>
            <input type="password" placeholder="Current passphrase" value={encPhrase} onChange={(e) => setEncPhrase(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
            {encMsg && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6 }}>{encMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setEncPanel(null); resetEncForm(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={encBusy || !encPhrase} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: encBusy || !encPhrase ? 0.6 : 1 }}>
                {encBusy ? "Decrypting…" : "Disable"}
              </button>
            </div>
          </form>
        )}
        {(importing || calMsg) && (
          <div style={{ marginBottom: 8 }}>
            {importing && (
              <div
                style={{
                  height: 3,
                  background: "#dcfce7",
                  borderRadius: 2,
                  overflow: "hidden",
                  marginBottom: calMsg ? 5 : 0,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: "40%",
                    background: "linear-gradient(90deg,#bbf7d0,#15803d,#bbf7d0)",
                    borderRadius: 2,
                    animation: "calbar 1.3s ease-in-out infinite",
                  }}
                />
              </div>
            )}
            {calMsg && (
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color:
                    calMsg.includes("failed") || calMsg.includes("cancelled")
                      ? "#b91c1c"
                      : "#15803d",
                }}
              >
                {calMsg}
              </p>
            )}
          </div>
        )}
        {calAudit && (
          <CalendarAuditPanel
            audit={calAudit}
            friends={friends}
            onConfirmHang={handleConfirmHang}
            onClose={() => setCalAudit(null)}
          />
        )}

        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, group, tag…"
            style={{
              width: "100%",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "8px 32px 8px 12px",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              background: "#fff",
              color: "#111827",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9ca3af",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#9ca3af", userSelect: "none", flexShrink: 0 }}>
            ⇅
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "5px 8px",
              fontSize: 12,
              outline: "none",
              background: "#fff",
              color: "#374151",
              cursor: "pointer",
            }}
          >
            <option value="name">Name</option>
            <option value="wat">WAT score</option>
            <option value="lastHang">Last hang</option>
            <option value="overdue">Most overdue</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
            style={{
              flexShrink: 0,
              padding: "5px 9px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              color: "#374151",
            }}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          {active.some((f) => typeof f.rankings?.reliability !== "number") && (
            <button
              onClick={() => setShowSeedRound(true)}
              title="Head-to-head pairwise comparisons to rank unranked friends"
              style={{
                flexShrink: 0,
                padding: "5px 9px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#9ca3af",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Rank
            </button>
          )}
          {hasAnyRanked && (
            <button
              onClick={() => {
                setRankMode((v) => !v);
                setDragFromIdx(null);
              }}
              title="Drag friends to reorder their reliability ranking"
              style={{
                flexShrink: 0,
                padding: "5px 9px",
                borderRadius: 8,
                border: rankMode ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                background: rankMode ? "#eff6ff" : "#fff",
                color: rankMode ? "#1d4ed8" : "#9ca3af",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {rankMode ? "Drag to Rank Mode on ●" : "Enable Drag to Rank Mode"}
            </button>
          )}
        </div>

        {sortBy === "wat" && !rankMode && (
          <div
            style={{
              marginBottom: 8,
              padding: "8px 10px",
              background: "#f9fafb",
              borderRadius: 10,
              border: "1px solid #f3f4f6",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 5,
              }}
            >
              Key — all scores 0–100
            </div>
            {[
              ["W", "Willing", "activity interest × openness × energy", "40%", "#6d28d9"],
              ["A", "Able", "schedule × logistics × distance", "35%", "#0284c7"],
              ["T", "Trust", "flake history + response velocity", "25%", "#15803d"],
            ].map(([k, name, detail, weight, c]) => (
              <div
                key={k}
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  marginBottom: 3,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 5,
                }}
              >
                <span style={{ color: c, fontWeight: 700, width: 10 }}>{k}</span>
                <span style={{ color: "#374151", fontWeight: 600 }}>{name}</span>
                <span>— {detail}</span>
                <span style={{ marginLeft: "auto", color: "#d1d5db", fontWeight: 700 }}>
                  {weight}
                </span>
              </div>
            ))}
            <div
              style={{
                marginTop: 5,
                fontSize: 10,
                color: "#d1d5db",
                borderTop: "1px solid #f3f4f6",
                paddingTop: 5,
              }}
            >
              Score = W×40 + A×35 + T×25, then adjusted for recency &amp; cooldown · general hang /
              weekday evening
            </div>
          </div>
        )}

        {/* Groups row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
          <button
            onClick={() => setShowGroups((v) => !v)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: showGroups ? "#4f46e5" : "#9ca3af",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "5px 0",
              flexShrink: 0,
              width: 56,
              textAlign: "right",
            }}
          >
            Groups {showGroups ? "▾" : "▸"}
          </button>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["All", ...allGroups, "Other"].map((g) => {
              const cnt = g === "All" ? active.length : (counts[g] ?? 0);
              return (
                <button
                  key={g}
                  onClick={() => setGrp(g)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: grp === g ? "#4f46e5" : "#f3f4f6",
                    color: grp === g ? "#fff" : "#6b7280",
                    border: "none",
                  }}
                >
                  {g} <span style={{ opacity: 0.65, fontWeight: 400 }}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
        {showGroups && (
          <div
            style={{
              marginLeft: 64,
              marginBottom: 6,
              background: "#f9fafb",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {allGroups.length === 0 && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                No groups yet — add one via a friend's edit form.
              </span>
            )}
            {allGroups.map((g) => {
              const members = active.filter((f) => f.groups?.includes(g));
              const isOpen = expandedGroup === g;
              return (
                <div key={g}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {renamingGroup === g ? (
                      <div style={{ flex: 1, display: "flex", gap: 5 }}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameGroup(g, renameValue);
                            if (e.key === "Escape") {
                              setRenamingGroup(null);
                              setRenameValue("");
                            }
                          }}
                          style={{
                            flex: 1,
                            border: "1px solid #a5b4fc",
                            borderRadius: 6,
                            padding: "2px 7px",
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={() => renameGroup(g, renameValue)}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#4f46e5",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setRenamingGroup(null);
                            setRenameValue("");
                          }}
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setExpandedGroup(isOpen ? null : g)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#374151",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {isOpen ? "▾" : "▸"} {g}{" "}
                        <span style={{ fontWeight: 400, color: "#9ca3af" }}>{members.length}</span>
                      </button>
                    )}
                    {renamingGroup !== g && (
                      <button
                        onClick={() => {
                          setRenamingGroup(g);
                          setRenameValue(g);
                          setConfirmDeleteGroup(null);
                        }}
                        style={{
                          fontSize: 11,
                          color: "#6b7280",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Rename
                      </button>
                    )}
                    {renamingGroup !== g && (
                      <button
                        onClick={() => moveGroupToTag(g)}
                        style={{
                          fontSize: 11,
                          color: "#f59e0b",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        → Tag
                      </button>
                    )}
                    {confirmDeleteGroup === g ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 11, color: "#ef4444" }}>Remove group?</span>
                        <button
                          onClick={() => {
                            deleteGroup(g);
                            setConfirmDeleteGroup(null);
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#ef4444",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteGroup(null)}
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteGroup(g)}
                        style={{
                          fontSize: 11,
                          color: "#ef4444",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 5,
                        paddingLeft: 12,
                      }}
                    >
                      {friends
                        .filter((f) => (f.wantAround ?? "active") === "active")
                        .map((f) => {
                          const inGroup = f.groups?.includes(g);
                          return (
                            <button
                              key={f.id}
                              onClick={() => toggleMembership(f.id, g)}
                              style={{
                                padding: "3px 10px",
                                borderRadius: 99,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                background: inGroup ? "#0ea5e9" : "#f3f4f6",
                                color: inGroup ? "#fff" : "#9ca3af",
                                border: "none",
                              }}
                            >
                              {f.name}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tags row */}
        {allTags.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
              <button
                onClick={() => setShowTags((v) => !v)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: showTags ? "#b45309" : "#9ca3af",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 0",
                  flexShrink: 0,
                  width: 56,
                  textAlign: "right",
                }}
              >
                Tags {showTags ? "▾" : "▸"}
              </button>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["All", ...allTags].map((t) => {
                  const cnt = t === "All" ? active.length : (tagCounts[t] ?? 0);
                  return (
                    <button
                      key={t}
                      onClick={() => setTag(t)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: tag === t ? "#f59e0b" : "#f3f4f6",
                        color: tag === t ? "#fff" : "#6b7280",
                        border: "none",
                      }}
                    >
                      {t} <span style={{ opacity: 0.65, fontWeight: 400 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {showTags && (
              <div
                style={{
                  marginLeft: 64,
                  marginBottom: 6,
                  background: "#f9fafb",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {allTags.map((t) => {
                  const members = active.filter((f) => f.tags?.includes(t));
                  const isOpen = expandedTag === t;
                  return (
                    <div key={t}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {renamingTag === t ? (
                          <div style={{ flex: 1, display: "flex", gap: 5 }}>
                            <input
                              autoFocus
                              value={renameTagValue}
                              onChange={(e) => setRenameTagValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") renameTag(t, renameTagValue);
                                if (e.key === "Escape") {
                                  setRenamingTag(null);
                                  setRenameTagValue("");
                                }
                              }}
                              style={{
                                flex: 1,
                                border: "1px solid #fcd34d",
                                borderRadius: 6,
                                padding: "2px 7px",
                                fontSize: 12,
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => renameTag(t, renameTagValue)}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#f59e0b",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setRenamingTag(null);
                                setRenameTagValue("");
                              }}
                              style={{
                                fontSize: 11,
                                color: "#9ca3af",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setExpandedTag(isOpen ? null : t)}
                            style={{
                              flex: 1,
                              textAlign: "left",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#374151",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {isOpen ? "▾" : "▸"} {t}{" "}
                            <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                              {members.length}
                            </span>
                          </button>
                        )}
                        {renamingTag !== t && (
                          <button
                            onClick={() => {
                              setRenamingTag(t);
                              setRenameTagValue(t);
                              setConfirmDeleteTag(null);
                            }}
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Rename
                          </button>
                        )}
                        {renamingTag !== t && (
                          <button
                            onClick={() => moveTagToGroup(t)}
                            style={{
                              fontSize: 11,
                              color: "#0ea5e9",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            → Group
                          </button>
                        )}
                        {confirmDeleteTag === t ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: "#ef4444" }}>Remove tag?</span>
                            <button
                              onClick={() => {
                                deleteTag(t);
                                setConfirmDeleteTag(null);
                              }}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#ef4444",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteTag(null)}
                              style={{
                                fontSize: 11,
                                color: "#9ca3af",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteTag(t)}
                            style={{
                              fontSize: 11,
                              color: "#ef4444",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 5,
                            paddingLeft: 12,
                          }}
                        >
                          {friends
                            .filter((f) => (f.wantAround ?? "active") === "active")
                            .map((f) => {
                              const hasTag = f.tags?.includes(t);
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => toggleTagMembership(f.id, t)}
                                  style={{
                                    padding: "3px 10px",
                                    borderRadius: 99,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    background: hasTag ? "#f59e0b" : "#f3f4f6",
                                    color: hasTag ? "#fff" : "#9ca3af",
                                    border: "none",
                                  }}
                                >
                                  {f.name}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Status row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#9ca3af",
              padding: "5px 0",
              flexShrink: 0,
              width: 56,
              textAlign: "right",
            }}
          >
            Status
          </span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["All", ...STATUSES].map((s) => {
              const cnt = s === "All" ? active.length : (statusCounts[s] ?? 0);
              if (s !== "All" && cnt === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: statusFilter === s ? "#0ea5e9" : "#f3f4f6",
                    color: statusFilter === s ? "#fff" : "#6b7280",
                    border: "none",
                  }}
                >
                  {s} <span style={{ opacity: 0.65, fontWeight: 400 }}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => setShowActive((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: "#6b7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            marginBottom: showActive ? 6 : 0,
          }}
        >
          <span>{showActive ? "▾" : "▸"}</span>
          <span>
            {sorted.length} active
            {sorted.length !== active.length ? ` (${active.length} total)` : ""}
          </span>
        </button>

        {showActive && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rankMode ? (
              <>
                {combinedList.map((f, origIdx) => {
                  const M = rankModeFriends.length;
                  const showSep =
                    origIdx === M && unrankedActive.length > 0 && M > 0 && dragFromIdx === null;
                  const isHovered = dragFromIdx !== null && dragOverId === f.id;
                  return (
                    <div key={f.id}>
                      {showSep && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#d1d5db",
                            textAlign: "center",
                            padding: "2px 0 6px",
                            userSelect: "none",
                          }}
                        >
                          — unranked —
                        </div>
                      )}
                      {isHovered && dropBefore && (
                        <div
                          style={{
                            height: 3,
                            borderRadius: 2,
                            background: "#3b82f6",
                            margin: "0 4px 4px",
                          }}
                        />
                      )}
                      {renderFriendCard(f, origIdx)}
                      {isHovered && !dropBefore && (
                        <div
                          style={{
                            height: 3,
                            borderRadius: 2,
                            background: "#3b82f6",
                            margin: "4px 4px 0",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              sorted.map((f) => renderFriendCard(f, null))
            )}
          </div>
        )}

        {inactive.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowArchived((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#9ca3af",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              <span>{showArchived ? "▾" : "▸"}</span>
              <span>{inactive.length} inactive</span>
            </button>
            {showArchived &&
              inactive.map((f) => (
                <div
                  key={f.id}
                  style={{
                    marginTop: 5,
                    background: "#f9fafb",
                    borderRadius: 10,
                    border: "1px solid #f3f4f6",
                    padding: "9px 13px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{f.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#ef4444" }}>
                      Set as inactive priority
                    </span>
                  </div>
                  <button
                    onClick={() => onUpdate(f.id, (x) => ({ ...x, wantAround: "active" }))}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#f3f4f6",
                      color: "#6b7280",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Make priority
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Inline RankSession for a single friend from the card */}

      {rankingFriendId &&
        (() => {
          const rf = friends.find((f) => f.id === rankingFriendId);
          if (!rf) return null;
          const attr = "reliability";
          const prompt = RANKED_ATTRS.find((a) => a.key === attr)?.prompt ?? attr;
          const orderedIds =
            rf.rankings?.[attr] != null
              ? rankedOrder(friends, attr).filter((id) => id !== rf.id) // re-rank: strip self
              : rankedOrder(friends, attr); // new rank: full current order
          return (
            <RankSession
              orderedIds={orderedIds}
              newId={rf.id}
              prompt={prompt}
              friends={friends}
              onComplete={(finalOrder) => {
                setRankingFriendId(null);
                if (onBatchRankUpdate)
                  onBatchRankUpdate(buildRankingWrites(friends, attr, finalOrder));
              }}
              onCancel={() => setRankingFriendId(null)}
            />
          );
        })()}

      {/* Seed round: batch ranking for all unranked friends */}
      {showSeedRound && (
        <SeedRound
          friends={friends}
          onComplete={(patches) => {
            setShowSeedRound(false);
            if (onBatchRankUpdate) onBatchRankUpdate(patches);
          }}
          onCancel={() => setShowSeedRound(false)}
        />
      )}
    </>
  );
}
