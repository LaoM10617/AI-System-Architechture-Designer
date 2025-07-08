function initArchitecture() {
    const { whiteboard, generateBtn } = window;
    generateBtn.addEventListener('click', async function () {
        // 生成架构按钮事件
        generateBtn.addEventListener('click', async function () {
            // 显示加载遮罩
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div>';
            whiteboard.appendChild(overlay);

            // 收集参数
            const appType = document.getElementById('appType').value;
            const userCount = document.getElementById('userCount').value;
            const projectDesc = document.getElementById('projectDesc').value;
            // 收集功能
            const features = [];
            for (let i = 1; i <= 8; i++) {
                if (document.getElementById('feature' + i).checked) {
                    features.push(document.querySelector('label[for="feature' + i + '"]').textContent);
                }
            }
            //收集便签内容
            const notes = Array.from(document.querySelectorAll(".note"))
                .map(note => note.innerText.trim())
                .filter(text => text !== "");

            // 检查 resultNote 是否还在白板上，不在则重新创建
            let resultNote = document.getElementById('resultNote');
            if (!resultNote || !whiteboard.contains(resultNote)) {
                resultNote = document.createElement('div');
                resultNote.className = 'note result-note';
                resultNote.id = 'resultNote';
                resultNote.style.top = '350px';
                resultNote.style.left = '300px';
                resultNote.style.display = 'none';
                resultNote.innerHTML = `
                        <div class="note-header">
                            <div>
                                <div class="title-edit-tooltip">Double-click to edit title</div>
                                <div class="note-title" tabindex="0">AI Architecture Proposal</div>
                            </div>
                            <div class="note-actions">
                                <div class="note-action"><i class="fas fa-times"></i></div>
                            </div>
                        </div>
                        <div class="note-content"></div>
                    `;
                whiteboard.appendChild(resultNote);
            }

            try {
                const response = await fetch('http://127.0.0.1:8000/api/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: projectDesc,
                        appType: appType,
                        features: features,
                        userCount: userCount,
                        notes: notes
                    })
                });
                const data = await response.json();
                whiteboard.removeChild(overlay);
                resultNote.style.display = 'block';
                resultNote.querySelector('.note-content').innerText = data.result || 'No result.';
                resultNote.scrollIntoView({ behavior: 'smooth', block: 'center' });
                addNoteEvents(resultNote);
            } catch (err) {
                whiteboard.removeChild(overlay);
                alert('架构生成服务连接失败，请确认后端服务已启动并允许本地访问。');
                console.error('生成架构请求失败:', err);
            }
        });
    });
}

window.initArchitecture = initArchitecture;

