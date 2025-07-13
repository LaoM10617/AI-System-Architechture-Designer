function initTrashBin() {
    // Debugging: Confirm elements exist
    console.log('Elements:', { bins, trashBin, docBin });

    bins.addEventListener('click', function () {
        const binsIcon = this.querySelector('i');
        binsVisible = !binsVisible;

        if (binsVisible) {
            trashBin.classList.remove('hidden');
            docBin.classList.remove('hidden');
        } else {
            trashBin.classList.add('hidden');
            docBin.classList.add('hidden');
        }

        // Toggle icon
        binsIcon.classList.toggle('fa-eye');
        binsIcon.classList.toggle('fa-eye-slash');
    });

    // ����Ͱ����¼�
    trashBin.addEventListener('click', function () {
        // ���ٵ���
    });

    // ����Ͱ��ק�ָ�����
    trashBin.setAttribute('draggable', 'true');

    trashBin.addEventListener('dragstart', function (e) {
        if (deletedNotesArr.length === 0) return;
        const last = deletedNotesArr[deletedNotesArr.length - 1];
        e.dataTransfer.setData('text/plain', 'restore-note');
        // ��קԤ���ڵ�
        dragPreview = document.createElement('div');
        dragPreview.innerHTML = last.html;
        dragPreview.style.position = 'absolute';
        dragPreview.style.pointerEvents = 'none';
        dragPreview.style.opacity = '0.7';
        dragPreview.style.zIndex = '9999';
        document.body.appendChild(dragPreview);
        e.dataTransfer.setDragImage(dragPreview, 100, 30);
    });

    trashBin.addEventListener('dragend', function () {
        if (dragPreview && dragPreview.parentNode) {
            dragPreview.parentNode.removeChild(dragPreview);
            dragPreview = null;
        }
    });

    // �������Ͱ�л���ʾ/����
    trashBin.addEventListener('click', function (e) {
        if (deletedNotesArr.length === 0) return;
        trashListVisible = !trashListVisible;
        trashList.style.display = trashListVisible ? 'block' : 'none';
        e.stopPropagation();
    });

    // ���ҳ�������ط��ر�
    window.addEventListener('click', function () {
        if (trashListVisible) {
            trashList.style.display = 'none';
            trashListVisible = false;
        }
    });

    // ��ֹ��� list ����ð�ݣ�������ر�
    trashList.addEventListener('click', function (e) {
        e.stopPropagation();
    });



    // �ָ���ǩ����
    function restoreNote(idx, x, y) {
        const item = deletedNotesArr.splice(idx, 1)[0];
        const temp = document.createElement('div');
        temp.innerHTML = item.html;
        const restoredNote = temp.firstElementChild;
        // ��λ
        if (x !== null && y !== null) {
            const whiteboardRect = whiteboard.getBoundingClientRect();
            // ֱ���ñ�ǩ���ϽǶ������ָ��
            restoredNote.style.left = (x - whiteboardRect.left) + 'px';
            restoredNote.style.top = (y - whiteboardRect.top) + 'px';
        } else {
            restoredNote.style.left = item.left;
            restoredNote.style.top = item.top;
        }
        restoredNote.style.transform = '';
        restoredNote.style.opacity = '1';
        whiteboard.appendChild(restoredNote);
        addNoteEvents(restoredNote);
        deletedNotes--;
        trashCount.textContent = deletedNotes;
        updateTrashList();
        // ����������ѿգ��Զ��رյ���
        if (deletedNotesArr.length === 0 && trashListVisible) {
            setTimeout(() => {
                trashList.style.display = 'none';
                trashListVisible = false;
            }, 400);
        }
    }

    // ��ק�ָ���֧�ִ� trash-list ��ק��
    whiteboard.addEventListener('dragover', function (e) {
        if (deletedNotesArr.length === 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    whiteboard.addEventListener('drop', function (e) {
        if (deletedNotesArr.length === 0) return;
        e.preventDefault();
        let idx = e.dataTransfer.getData('text/plain');
        idx = parseInt(idx);
        if (isNaN(idx) || idx < 0 || idx >= deletedNotesArr.length) return;
        restoreNote(idx, e.clientX, e.clientY);
    });

    // ����Ͱ֧����קɾ��
    trashBin.addEventListener('dragover', function (e) {
        // ��������
        if (currentNote) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });

    trashBin.addEventListener('drop', function (e) {
        if (currentNote && whiteboard.contains(currentNote)) {
            e.preventDefault();
            // ɾ������
            const noteToDelete = currentNote;
            currentNote = null; // ������գ���ֹ��δ���
            noteToDelete.style.transform = 'scale(0.9)';
            noteToDelete.style.opacity = '0.5';
            setTimeout(() => {
                // �ٴ��жϽڵ���Ч��
                if (noteToDelete && whiteboard.contains(noteToDelete)) {
                    deletedNotesArr.push({
                        html: noteToDelete.outerHTML,
                        top: noteToDelete.style.top,
                        left: noteToDelete.style.left
                    });
                    whiteboard.removeChild(noteToDelete);
                    deletedNotes++;
                    trashCount.textContent = deletedNotes;
                    updateTrashList();
                }
            }, 200);
        }
    });
}

// ���»������б�
function updateTrashList() {
    trashList.innerHTML = '';

    // ��������ͷ������հ�ť
    const header = document.createElement('div');
    header.className = 'trash-header';
    header.innerHTML = `
                    <span style="font-weight:bold; color:#333;">Deleted Notes</span>
                    <button id="clearTrashBtn">Clear All</button>
                `;
    trashList.appendChild(header);

    // ������հ�ť�¼�
    const clearBtn = header.querySelector('#clearTrashBtn');
    clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (deletedNotesArr.length > 0) {
            if (confirm('Are you sure you want to permanently delete all items in the trash?')) {
                deletedNotesArr = [];
                deletedNotes = 0;
                trashCount.textContent = '0';
                updateTrashList();
                trashList.style.display = 'none';
                trashListVisible = false;
            }
        }
    });

    if (deletedNotesArr.length === 0) {
        // ��״̬��ʾ
        const emptyMsg = document.createElement('div');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#888';
        emptyMsg.style.fontSize = '13px';
        emptyMsg.style.padding = '8px 20px';
        emptyMsg.style.borderBottom = '1px solid #eee';
        emptyMsg.textContent = 'No deleted notes yet.';
        trashList.appendChild(emptyMsg);
        // 1����Զ��ر�
        setTimeout(() => {
            trashList.style.display = 'none';
            trashListVisible = false;
        }, 1000);
        // ͬ������
        trashCount.textContent = '0';
        return;
    }
    deletedNotesArr.forEach((item, idx) => {
        // ��ȡ����
        let temp = document.createElement('div');
        temp.innerHTML = item.html;
        let title = temp.querySelector('.note-title')?.textContent || 'Untitled';
        // �����б���
        const li = document.createElement('div');
        li.className = 'trash-list-item';
        li.setAttribute('draggable', 'true');
        li.innerHTML = `
                        <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:normal;word-break:break-all;display:inline-block;vertical-align:middle;">${title}</span>
                        <div style="display:flex; gap:5px;">
                            <button class="restore-btn" data-idx="${idx}"><i class='fas fa-undo' style='font-size:14px;color:#fff;'></i></button>
                            <button class="delete-btn" data-idx="${idx}"><i class='fas fa-trash' style='font-size:14px;color:#fff;'></i></button>
                        </div>
                    `;
        // ��ק�ָ�
        li.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', idx);
            // ��קԤ��
            dragPreview = document.createElement('div');
            dragPreview.innerHTML = item.html;
            dragPreview.style.position = 'absolute';
            dragPreview.style.pointerEvents = 'none';
            dragPreview.style.opacity = '0.7';
            dragPreview.style.zIndex = '9999';
            document.body.appendChild(dragPreview);
            e.dataTransfer.setDragImage(dragPreview, 100, 30);
        });
        li.addEventListener('dragend', function () {
            if (dragPreview && dragPreview.parentNode) {
                dragPreview.parentNode.removeChild(dragPreview);
                dragPreview = null;
            }
        });
        // ����ָ�
        li.querySelector('.restore-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            restoreNote(idx, null, null);
        });
        // �������ɾ��
        li.querySelector('.delete-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            const idxToDelete = parseInt(this.dataset.idx);
            if (confirm('Are you sure you want to permanently delete this note?')) {
                deletedNotesArr.splice(idxToDelete, 1);
                deletedNotes--;
                trashCount.textContent = deletedNotes;
                updateTrashList();
                // ����������ѿգ��Զ��رյ���
                if (deletedNotesArr.length === 0 && trashListVisible) {
                    setTimeout(() => {
                        trashList.style.display = 'none';
                        trashListVisible = false;
                    }, 400);
                }
            }
        });
        trashList.appendChild(li);
    });
}

window.initTrashBin = initTrashBin;

