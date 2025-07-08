function initFavorites() {
    const { favoritesArr, whiteboard, docBin } = window;
    const docPopup = document.getElementById('docPopup');

    // 监听白板区域收藏按钮点击
    whiteboard.addEventListener('click', function (e) {
        const btn = e.target.closest('.favorite-btn-in-footer');
        if (btn) {
            const icon = btn.querySelector('i');
            const note = btn.closest('.result-note');

            let type = 'architecture';
            if (note && note.querySelector('.note-title')) {
                const titleText = note.querySelector('.note-title').textContent.trim();
                if (/diagram/i.test(titleText)) type = 'diagram';
                const title = titleText;

                if (btn.classList.toggle('favorited')) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    favoritesArr.push({ type, title });
                } else {
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    const idx = favoritesArr.findIndex(item => item.type === type && item.title === title);
                    if (idx !== -1) favoritesArr.splice(idx, 1);
                }

                updateFavoritesList();
            }
        }
    });

    // 监听 docBin 点击，弹出收藏弹窗
    docBin.addEventListener('click', function (e) {
        e.stopPropagation();
        docPopup.style.display = docPopup.style.display === 'block' ? 'none' : 'block';

        const rect = docBin.getBoundingClientRect();
        docPopup.style.position = 'fixed';
        docPopup.style.right = '0px';
        docPopup.style.bottom = (window.innerHeight - rect.top + 10) + 'px';

        updateFavoritesList();
    });

    function updateFavoritesList() {
        const list = document.getElementById('favoritesList');
        list.innerHTML = '';

        const docCount = document.querySelector('.doc-count');
        docCount.textContent = favoritesArr.length;

        if (favoritesArr.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#888; font-size:13px; padding:8px 0;">No favorites yet.</div>';
            return;
        }

        favoritesArr.forEach(item => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';
            div.style.padding = '6px 18px';
            div.style.fontSize = '13px';
            div.innerHTML = `<span style="color:#2196f3;font-weight:bold;margin-right:6px;">[${item.type}]</span><span style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;">${item.title}</span>`;
            list.appendChild(div);
        });
    }

    // 如果别的模块后期需要调用
    window.updateFavoritesList = updateFavoritesList;
}

window.initFavorites = initFavorites;
