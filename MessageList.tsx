
import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Download } from 'lucide-react';
import type { Message } from './types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleDownload = (base64Data: string, mimeType: string) => {
    const link = document.createElement('a');
    link.href = `data:${mimeType};base64,${base64Data}`;
    const ext = mimeType.includes('video') ? 'mp4' : 'png';
    link.download = `生成-${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center">
            <span className="text-2xl">✨</span>
          </div>
          <p className="text-lg font-medium">开始创作吧</p>
        </div>
      )}
      
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl p-5 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-neutral-800 text-neutral-200 shadow-sm border border-neutral-700'
            }`}
          >
            <div className="space-y-4">
              {msg.parts.map((part, index) => {
                if (part.type === 'text') {
                  return (
                    <div key={index} className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{part.content}</ReactMarkdown>
                    </div>
                  );
                } else if (part.type === 'image') {
                  return (
                    <div key={index} className="relative group rounded-xl overflow-hidden bg-neutral-950 border border-neutral-700">
                      <img
                        src={`data:${part.mimeType || 'image/png'};base64,${part.content}`}
                        alt="生成内容"
                        className="w-full h-auto max-h-[512px] object-contain"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDownload(part.content, part.mimeType || 'image/png')}
                          className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
                          title="下载图片"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                } else if (part.type === 'video') {
                  const mimeType = part.mimeType || 'video/mp4';
                  const isUrl = part.source === 'url' || part.content.startsWith('http') || part.content.startsWith('gs://');
                  const isPlayableUrl = part.content.startsWith('http');
                  const src = isUrl ? part.content : `data:${mimeType};base64,${part.content}`;

                  return (
                    <div key={index} className="relative group rounded-xl overflow-hidden bg-neutral-950 border border-neutral-700 p-3">
                      {isUrl && !isPlayableUrl ? (
                        <a
                          href={part.content}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-300 hover:text-blue-200 underline break-all"
                        >
                          {part.content}
                        </a>
                      ) : (
                        <video
                          src={src}
                          controls
                          className="w-full max-h-[512px] rounded-lg bg-black"
                        />
                      )}

                      {!isUrl && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleDownload(part.content, mimeType)}
                            className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-colors"
                            title="下载视频"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* 费用信息 */}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-neutral-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"></div>
            </div>
            <span className="text-sm text-neutral-400 font-medium">正在生成中...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
