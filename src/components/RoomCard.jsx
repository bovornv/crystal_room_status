import React, { useState, useEffect } from "react";

const RoomCard = ({ room, setRooms, updateRoomImmediately, isLoggedIn, onLoginRequired, currentNickname, currentDate, setIsManualEdit }) => {
  // Helper function to normalize status - migrate moved_out to checked_out
  // Both mean "ออกแล้ว" (already departed), so we consolidate to checked_out only
  const normalizeStatusForEdit = (status) => {
    return status === "moved_out" ? "checked_out" : status;
  };
  
  // Migrate moved_out to checked_out when saving (for consistency)
  const migrateStatusOnSave = (status) => {
    return status === "moved_out" ? "checked_out" : status;
  };

  const [remark, setRemark] = useState(room.remark);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState(normalizeStatusForEdit(room.status));

  // Sync state when room prop changes, but only if modal is not open
  useEffect(() => {
    setRemark(room.remark);
    // Only update editStatus if the edit modal is not open (to prevent resetting user's selection)
    // This prevents Firestore updates from resetting the dropdown while user is selecting
    if (!editOpen) {
      setEditStatus(normalizeStatusForEdit(room.status));
    }
  }, [room.remark, room.status, editOpen]);

  const colorMap = {
    checked_out: "bg-red-300", // ออกแล้ว (already departed)
    moved_out: "bg-red-300", // ออกแล้ว (already departed)
    will_depart_today: "bg-yellow-200", // จะออกวันนี้ (will depart today)
    stay_clean: "bg-blue-200", // พักต่อ (staying over)
    cleaned: "bg-green-200",
    vacant: "bg-white",
    closed: "bg-gray-500 text-white",
    long_stay: "bg-gray-200",
  };

  const isSuite = room.type.toUpperCase().startsWith("S");

  const saveRemark = () => {
    // Require login
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }
    
    // Set flag to prevent Firestore listener from overwriting during remark save
    if (setIsManualEdit) {
      setIsManualEdit(true);
    }
    
    let finalRemark = remark.trim();
    
    // If remark is not empty, append "รายงานโดย [nickname] [day month]"
    if (finalRemark && currentNickname && currentDate) {
      // Remove any existing "รายงานโดย" at the end
      finalRemark = finalRemark.replace(/\s*\(รายงานโดย .+\)\s*$/, '').trim();
      // Append new report info
      finalRemark += ` (รายงานโดย ${currentNickname} ${currentDate})`;
    }
    // If remark is empty, keep it empty (don't add anything)
    
    console.log(`Saving remark for room ${room.number}: ${finalRemark.substring(0, 50)}...`);
    
    // Update room immediately for real-time sync
    if (updateRoomImmediately) {
      updateRoomImmediately(room.number, { remark: finalRemark });
    } else {
      // Fallback to old method if updateRoomImmediately is not available
      setRooms(prev =>
        prev.map(r => r.number === room.number ? { ...r, remark: finalRemark } : r)
      );
    }
    
    // Close modal after a brief delay to ensure state update is processed
    setTimeout(() => {
      setRemarkOpen(false);
    }, 100);
  };

  // Handler for status dropdown change (direct on card)
  const handleStatusSelect = (e) => {
    e.stopPropagation(); // Prevent card click from opening modal
    
    // Require login
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }
    
    const newStatus = e.target.value;
    const wasCleaned = newStatus === "cleaned" && room.status !== "cleaned";
    const isFO = currentNickname === "FO";
    
    // Migrate moved_out to checked_out if needed
    const finalStatus = migrateStatusOnSave(newStatus);
    
    // Determine border color: red if cleaned (green), black otherwise
    const borderColor = finalStatus === "cleaned" ? "red" : "black";
    
    // Prepare room updates
    const roomUpdates = {
      status: finalStatus,
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
      border: borderColor,
      // FO doesn't add or overwrite names - preserve existing lastEditor
      // For non-FO users, update lastEditor normally
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      cleanedBy: wasCleaned ? (currentNickname || "") : (room.cleanedBy || ""),
      selectedBy: wasCleaned ? "" : (room.selectedBy || "")
    };
    
    // Update room immediately for real-time sync
    if (updateRoomImmediately) {
      updateRoomImmediately(room.number, roomUpdates);
    } else {
      // Fallback to old method if updateRoomImmediately is not available
      setRooms(prev =>
        prev.map(r => 
          r.number === room.number 
            ? { ...r, ...roomUpdates }
            : r
        )
      );
    }
  };

  const handleSelectRoom = () => {
    // Require login
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }
    
    // Toggle border: if currently black, change to red; if red, change to black
    const newBorder = room.border === "red" ? "black" : "red";
    
    console.log(`Selecting room ${room.number} by ${currentNickname} - border: ${newBorder}`);
    
    // Update room immediately for real-time sync
    if (updateRoomImmediately) {
      updateRoomImmediately(room.number, {
        selectedBy: currentNickname || "", // Store nickname of user who selected
        lastEditor: currentNickname === "FO" ? (room.lastEditor || "") : (currentNickname || ""), // FO preserves existing, others update
        border: newBorder // Toggle border color
      });
    } else {
      // Fallback to old method if updateRoomImmediately is not available
      setRooms(prev =>
        prev.map(r => 
          r.number === room.number 
            ? { 
                ...r, 
                selectedBy: currentNickname || "",
                lastEditor: currentNickname === "FO" ? (r.lastEditor || "") : (currentNickname || ""),
                border: newBorder
              } 
            : r
        )
      );
    }
    
    // Close modal after a brief delay to ensure state update is processed
    setTimeout(() => {
      setEditOpen(false);
    }, 100);
  };

  const saveEdit = () => {
    const wasCleaned = editStatus === "cleaned" && room.status !== "cleaned";
    const wasClosed = editStatus === "closed" && room.status !== "closed";
    
    // FO user can change status but should not add/overwrite names
    // FO should preserve existing lastEditor (don't replace other users' names or add "FO")
    const isFO = currentNickname === "FO";
    
    // Migrate moved_out to checked_out if needed
    const finalStatus = migrateStatusOnSave(editStatus);
    
    // Determine border color: red if cleaned (green), black otherwise
    const borderColor = finalStatus === "cleaned" ? "red" : "black";
    
    // Prepare room updates
    const roomUpdates = {
      status: finalStatus,
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
      border: borderColor, // Set border based on status
      // FO doesn't add or overwrite names - preserve existing lastEditor
      // For non-FO users, update lastEditor normally
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      cleanedBy: wasCleaned ? (currentNickname || "") : (room.cleanedBy || ""), // Track who cleaned the room
      selectedBy: wasCleaned ? "" : (room.selectedBy || "") // Clear selection when cleaned
    };
    
    // Update room immediately for real-time sync
    if (updateRoomImmediately) {
      updateRoomImmediately(room.number, roomUpdates);
    } else {
      // Fallback to old method if updateRoomImmediately is not available
      setRooms(prev =>
        prev.map(r => 
          r.number === room.number 
            ? { ...r, ...roomUpdates }
            : r
        )
      );
    }
    
    // Close modal after a brief delay to ensure state update is processed
    setTimeout(() => {
      setEditOpen(false);
    }, 100);
  };

  // Status options with bilingual labels (Thai + English)
  // Ordered as requested by user
  const statusList = [
    { value: "cleaned", th: "ทำห้องเสร็จแล้ว", en: "Room cleaned", color: "bg-green-200" },
    { value: "closed", th: "ปิดห้อง", en: "Room closed", color: "bg-gray-500 text-white" },
    { value: "checked_out", th: "ออกแล้ว", en: "Checked out", color: "bg-red-300" },
    { value: "vacant", th: "ว่าง", en: "Vacant", color: "bg-white" },
    { value: "stay_clean", th: "พักต่อ", en: "Stay over", color: "bg-blue-200" },
    { value: "will_depart_today", th: "จะออกวันนี้", en: "Will depart today", color: "bg-yellow-200" },
    { value: "long_stay", th: "รายเดือน", en: "Long stay", color: "bg-gray-200" },
  ];

  // Status options for modal dropdown (Thai only)
  const statusOptions = statusList.map(s => ({
    value: s.value,
    label: s.th,
    color: s.color
  }));

  return (
    <>
      <div
        className={`relative rounded-lg shadow-sm p-1.5 flex-shrink-0
        ${colorMap[room.status] || "bg-white"}
        ${isSuite ? "w-20" : "w-16"} min-h-[100px] flex flex-col justify-between
        ${room.border === "red" ? "border-2 border-red-600" : "border border-black"}`}
      >
        <div className="flex-1 flex flex-col justify-between">
          {/* Clickable header area to open edit modal */}
          <div 
            className="cursor-pointer"
            onClick={() => {
              if (isLoggedIn) {
                setEditStatus(normalizeStatusForEdit(room.status));
                setEditOpen(true);
              } else {
                onLoginRequired();
              }
            }}
          >
            <div className="font-bold text-base leading-tight">{room.number}</div>
            <div className="text-[10px] text-[#63738A] leading-tight">{room.type}</div>
            {(room.selectedBy || room.status === "cleaned") && room.lastEditor && (
              <div className="text-xs sm:text-[10px] text-[#15803D] italic leading-tight mt-0.5">
                {room.lastEditor}
              </div>
            )}
          </div>
          
          {/* Mobile-friendly bilingual status dropdown */}
          <div className="mt-1 w-full" onClick={(e) => e.stopPropagation()}>
            <select
              value={normalizeStatusForEdit(room.status) || "vacant"}
              onChange={handleStatusSelect}
              className={`w-full rounded-lg border border-gray-300 p-1.5 text-[9px] sm:text-[10px] font-medium text-[#0B1320]
              focus:outline-none focus:ring-2 focus:ring-[#15803D] transition-all
              ${statusList.find(s => s.value === normalizeStatusForEdit(room.status))?.color || "bg-white"}`}
              style={{ minHeight: "32px" }}
              onClick={(e) => e.stopPropagation()}
            >
              {statusList.map((s) => (
                <option key={s.value} value={s.value}>
                  {`${s.th}  •  ${s.en}`}
                </option>
              ))}
            </select>
          </div>
          
          {room.maid && (
            <div className="text-xs sm:text-[10px] italic text-[#0B1320] truncate mt-0.5">{room.maid}</div>
          )}
        </div>

        <div
          className={`absolute bottom-0.5 right-0.5 w-5 h-5 sm:w-4 sm:h-4 rounded-full cursor-pointer z-10 ${
            room.remark ? "bg-red-600" : "bg-gray-400"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (isLoggedIn) {
              setRemarkOpen(true);
            } else {
              onLoginRequired();
            }
          }}
          title={room.remark || "Add remark"}
        />
      </div>

      {/* Edit Status/Maid Modal */}
      {editOpen && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            onClick={(e) => {
              // Close modal if clicking on backdrop (not on modal content)
              if (e.target === e.currentTarget) {
                setEditOpen(false);
                setEditStatus(normalizeStatusForEdit(room.status));
              }
            }}
        >
          <div 
            className="bg-white rounded-2xl p-4 w-80 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-medium mb-3 text-[#0B1320]">
              แก้ไขห้อง {room.number}
            </h2>
            
            <div className="mb-3">
              <label className="block text-sm font-medium text-[#0B1320] mb-1">
                สถานะ
              </label>
              <select
                value={normalizeStatusForEdit(editStatus)}
                onChange={e => {
                  const newStatus = e.target.value;
                  // Ensure we never set moved_out - always use checked_out instead
                  setEditStatus(newStatus === "moved_out" ? "checked_out" : newStatus);
                }}
                className="w-full border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#15803D]"
              >
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectRoom();
                }}
                className="px-4 py-2 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] transition-colors cursor-pointer"
                type="button"
              >
                เลือกห้องนี้
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setEditOpen(false);
                    // Reset to current room status when canceling
                    setEditStatus(normalizeStatusForEdit(room.status));
                  }}
                  className="px-3 py-1 bg-gray-100 rounded-lg"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={saveEdit}
                  className="px-3 py-1 bg-[#15803D] text-white rounded-lg"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remark Modal */}
      {remarkOpen && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => {
            // Close modal if clicking on backdrop (not on modal content)
            if (e.target === e.currentTarget) {
              setRemarkOpen(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl p-4 w-80 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-medium mb-2 text-[#0B1320]">
              หมายเหตุ ห้อง {room.number}
            </h2>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm h-24"
              placeholder="กรอกหมายเหตุ..."
            />
            <div className="flex justify-end gap-2 mt-3">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setRemarkOpen(false);
                }}
                className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                type="button"
              >
                ปิด
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  saveRemark();
                }}
                className="px-3 py-1 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] transition-colors cursor-pointer"
                type="button"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoomCard;

