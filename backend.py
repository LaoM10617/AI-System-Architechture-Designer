import os
from typing import List
from fastapi import FastAPI, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
import uvicorn

class RequestBody(BaseModel):
    prompt: str
    appType: str
    features: List[str]
    userCount: str

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncOpenAI(
    api_key=os.getenv("API_KEY"),
    base_url="https://dseek.aikeji.vip/v1"
)

@app.post("/api/generate")
async def generate(req: RequestBody):
    # 将选择题结果拼进 prompt
    full_prompt = (
        f"应用类型: {req.appType}\n"
        f"核心功能: {', '.join(req.features) or '无'}\n"
        f"预期用户量: {req.userCount}\n"
        f"项目描述: {req.prompt}"
    )
    response = await client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system",  "content": "你是一个帮助用户生成软件系统架构设计方案的助手。"},
            {"role": "user",    "content": full_prompt}
        ]
    )
    return {"result": response.choices[0].message.content}

# 启动： uvicorn backend:app --reload --host 0.0.0.0 --port 8000
# 生成diagram部分
class DiagramRequest(BaseModel):
    architecture_text:str
@app.post('/generate_diagram')
async def generate_diagram(req:DiagramRequest):
    prompt = f"""
    你是一个软件架构专家，请将以下系统架构描述转化为 mermaid.js 的流程图（graph TD 格式），只返回代码块，不需要任何解释。

    架构描述如下：
    {req.architecture_text}
    """
    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role":"user","content":prompt}],
            temperature=0.5
            )
        diagram_code = response.choices[0].message["content"]
        return{"diagram":diagram_code}
    except Exception as e:
        return{"error":str(e)}