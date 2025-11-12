import React, { useState, useEffect } from "react";

const RoomCard = ({ room, updateRoomImmediately, isLoggedIn, onLoginRequired, currentNickname, currentDate }) => {
  const [remark, setRemark] = useState(room.remark || "");
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState(room.status || "vacant");

  // Sync state when room prop changes
  useEffect(() => {
    setRemark(room.remark || "");
    if (!editOpen) {
      setEditStatus(room.status || "vacant");
    }
  }, [room.remark, room.status, editOpen]);

  const colorMap = {
    cleaned: "bg-green-200",
    closed: "bg-gray-500 text-white",
    checked_out: "bg-red-300",
    vacant: "bg-white",
    stay_clean: "bg-blue-200",
    will_depart_today: "bg-yellow-200",
    long_stay: "bg-gray-200",
  };

  // Status options with Thai labels only
  const statusOptions = [
    { value: "cleaned", label: "ทำห้องเสร็จแล้ว", color: "bg-green-200" },
    { value: "closed", label: "ปิดห้อง", color: "bg-gray-500" },
    { value: "checked_out", label: "ออกแล้ว", color: "bg-red-300" },
    { value: "vacant", label: "ว่าง", color: "bg-white" },
    { value: "stay_clean", label: "พักต่อ", color: "bg-blue-200" },
    { value: "will_depart_today", label: "จะออกวันนี้", color: "bg-yellow-200" },
    { value: "long_stay", label: "รายเดือน", color: "bg-gray-200" },
  ];

  const isSuite = room.type?.toUpperCase().startsWith("S");
  const borderColor = room.border === "red" ? "border-2 border-red-600" : "border border-black";

  // Handle status change (from buttons in modal)
  const handleStatusChange = async (newStatus) => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    const wasCleaned = newStatus === "cleaned" && room.status !== "cleaned";
    const isFO = currentNickname === "FO";
    
    // Determine border color: red if cleaned (green), black otherwise
    const borderColor = newStatus === "cleaned" ? "red" : "black";
    
    const roomUpdates = {
      status: newStatus,
      cleanedToday: wasCleaned ? true : (room.cleanedToday || false),
      border: borderColor,
      // FO doesn't add or overwrite names - preserve existing lastEditor
      lastEditor: isFO ? (room.lastEditor || "") : (currentNickname || ""),
      cleanedBy: wasCleaned ? (currentNickname || "") : (room.cleanedBy || ""),
      selectedBy: wasCleaned ? "" : (room.selectedBy || "")
    };

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  // Handle "เลือกห้องนี้" button - toggle border red/black
  const handleSelectRoom = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    // Toggle border: if currently red, change to black; if black, change to red
    const newBorder = room.border === "red" ? "black" : "red";
    
    const roomUpdates = {
      selectedBy: currentNickname || "",
      lastEditor: currentNickname === "FO" ? (room.lastEditor || "") : (currentNickname || ""),
      border: newBorder
    };

    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, roomUpdates);
    }
  };

  // Save status change from modal dropdown (if still using it)
  const saveEdit = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }

    await handleStatusChange(editStatus);
    setEditOpen(false);
  };

  // Save remark
  const saveRemark = async () => {
    if (!isLoggedIn || !currentNickname) {
      onLoginRequired();
      return;
    }
    
    let finalRemark = remark.trim();
    
    // If remark is not empty, append "รายงานโดย [nickname] [day month]"
    if (finalRemark && currentNickname && currentDate) {
      // Remove any existing "รายงานโดย" at the end
      finalRemark = finalRemark.replace(/\s*\(รายงานโดย .+\)\s*$/, '').trim();
      // Append new report info
      finalRemark += ` (รายงานโดย ${currentNickname} ${currentDate})`;
    }
    
    // Update immediately for real-time sync
    if (updateRoomImmediately) {
      await updateRoomImmediately(room.number, { remark: finalRemark });
    }
    
    setRemarkOpen(false);
  };

  return (
    <>
      <div
        className={`relative rounded-lg shadow-sm p-1.5 cursor-pointer flex-shrink-0
        ${colorMap[room.status] || "bg-white"}
        ${isSuite ? "w-20" : "w-16"} h-16 flex flex-col justify-between
        ${borderColor}`}
        onClick={() => {
          if (isLoggedIn) {
            setEditStatus(room.status || "vacant");
            setEditOpen(true);
          } else {
            onLoginRequired();
          }
        }}
      >
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="font-bold text-base leading-tight">{room.number}</div>
            <div className="text-[10px] text-[#63738A] leading-tight">{room.type}</div>
            {(room.selectedBy || room.status === "cleaned") && room.lastEditor && (
              <div className="text-xs sm:text-[10px] text-[#15803D] italic leading-tight mt-0.5">
                {room.lastEditor}
              </div>
            )}
          </div>
          {room.maid && (
            <div className="text-xs sm:text-[10px] italic text-[#0B1320] truncate">{room.maid}</div>
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

      {/* Edit Status Modal */}
      {editOpen && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditOpen(false);
              setEditStatus(room.status || "vacant");
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl p-4 w-80 shadow-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-medium mb-3 text-[#0B1320]">
              แก้ไขห้อง {room.number}
            </h2>
            
            {/* Status buttons (Thai only) */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-[#0B1320] mb-2">
                สถานะ
              </label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      room.status === opt.value 
                        ? `${opt.color} border-2 border-[#15803D]` 
                        : `${opt.color} border border-gray-300 hover:border-[#15803D]`
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={handleSelectRoom}
                className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                  room.border === "red"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-[#15803D] text-white hover:bg-[#166534]"
                }`}
                type="button"
              >
                เลือกห้องนี้
              </button>
              <button 
                onClick={() => {
                  setEditOpen(false);
                  setEditStatus(room.status || "vacant");
                }}
                className="px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remark Modal */}
      {remarkOpen && (
        <div 
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => {
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
