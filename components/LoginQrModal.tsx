"use client";

import { useEffect, useRef, useState } from "react";
import type { Platform } from "@/lib/types";

interface Props {
  open: boolean;
  platform: Platform;
  onClose: () => void;
  onLoggedIn: () => void;
}

const PLATFORM_LABEL: Record<Platform, string> = { weibo: "微博", xiaohongshu: "小红书", artstation: "ArtStation" };

export default function LoginQrModal({ open, platform, onClose, onLoggedIn }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("正在后台抓取二维码...");
  const [starting, setStarting] = useState(false);
  const [errored, setErrored] = useState(false);
  // 登录方式:qr = 网页扫码(默认,远程也可用);window = 弹本机 Chrome 窗口直接登录
  const [mode, setMode] = useState<"qr" | "window">("qr");

  // 只有在本机(localhost)访问时才提供"弹窗登录"——远程同事走 cloudflared 链接时
  // 弹窗会弹在服务器那台机器上,他们看不到,所以隐藏。
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    const h = window.location.hostname;
    setIsLocal(h === "localhost" || h === "127.0.0.1");
  }, []);

  // 把回调放 ref 里,避免父组件每次 render 时新函数引用让 useEffect 重跑、
  // 反复 POST 登录接口,导致后端 puppeteer 不停起新 Chrome 窗口、触发风控
  const onLoggedInRef = useRef(onLoggedIn);
  useEffect(() => { onLoggedInRef.current = onLoggedIn; }, [onLoggedIn]);

  const apiBase =
    platform === "weibo"
      ? "/api/weibo/login-status"
      : platform === "xiaohongshu"
      ? "/api/xhs/login-status"
      : "/api/artstation/login-status";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const startFlow = async () => {
      setStarting(true);
      setErrored(false);
      setQrDataUrl(null);
      try {
        const url = mode === "window" ? `${apiBase}?mode=window` : apiBase;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (mode === "window") {
          // 弹窗模式不返回二维码,等用户在 Chrome 窗口里登录,轮询会检测到
          setQrDataUrl(null);
          setErrored(false);
        } else if (data.qrDataUrl) {
          setQrDataUrl(data.qrDataUrl);
          setErrored(false);
        } else {
          // 后端返回了 message 但没拿到二维码 → 视为失败
          setErrored(true);
        }
        const msg =
          typeof data.message === "string"
            ? data.message
            : typeof data === "string"
            ? data
            : "未拿到二维码";
        setMessage(msg);
      } catch (err) {
        if (cancelled) return;
        setErrored(true);
        setMessage(`启动登录失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(apiBase, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.loggedIn) {
          onLoggedInRef.current();
        }
      } catch {
        // ignore
      }
    };

    startFlow();
    const t = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [open, apiBase, mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            登录 {PLATFORM_LABEL[platform]}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ×
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          二维码会显示在下方,请用手机 <strong className="text-slate-700">{PLATFORM_LABEL[platform]}</strong> App 扫码完成登录。
          <strong className="text-emerald-700">登录态会写入本地复用</strong>,下次扫描自动免登录。
        </p>

        <div className="bg-slate-50 rounded-xl p-6 flex flex-col items-center min-h-[240px] justify-center">
          {starting ? (
            <div className="text-center">
              <div className="text-3xl mb-2 animate-pulse">{mode === "window" ? "🖥️" : "📲"}</div>
              <p className="text-sm text-slate-600">
                {mode === "window" ? "正在弹出 Chrome 登录窗口" : "正在后台抓取二维码"}
              </p>
              <p className="text-xs text-slate-400 mt-1">第一次需要等 puppeteer 启动浏览器,约 3-8 秒</p>
            </div>
          ) : mode === "window" ? (
            <div className="text-center">
              <div className="text-3xl mb-2">🖥️</div>
              <p className="text-sm text-slate-700 font-medium">已弹出 Chrome 窗口</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-xs">
                请在弹出的 Chrome 窗口里完成登录,登录成功后这里会<strong className="text-emerald-700">自动检测</strong>并关闭。
              </p>
            </div>
          ) : qrDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="登录二维码" className="w-48 h-48 object-contain" />
              <p className="text-[11px] text-slate-500 mt-3">用 {PLATFORM_LABEL[platform]} App 扫一扫</p>
            </>
          ) : (
            <div className="text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm text-rose-600 font-medium">二维码加载失败</p>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-xs">
                可能原因:平台 selector 改版 / 网络不通 / puppeteer 残留进程。
                <br />可以先点「重新加载」试试{isLocal ? ",或改用「本机浏览器登录」" : ""}。
              </p>
            </div>
          )}
        </div>

        {isLocal && (
          <div className="mt-3 text-center">
            {mode === "qr" ? (
              <button
                onClick={() => setMode("window")}
                className="text-xs text-sky-600 hover:text-sky-700 underline underline-offset-2"
              >
                扫码不方便?改用「本机浏览器登录」（弹出 Chrome 直接登录）
              </button>
            ) : (
              <button
                onClick={() => setMode("qr")}
                className="text-xs text-sky-600 hover:text-sky-700 underline underline-offset-2"
              >
                ← 返回扫码登录
              </button>
            )}
          </div>
        )}

        <p className={`text-[11px] mt-3 text-center break-words ${errored ? "text-rose-500" : "text-slate-500"}`}>
          {message}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              // 触发一次重新启动:依赖 useEffect 的 open 依赖,这里通过 closing+reopen 不方便,
              // 改成直接重新跑一次 fetch
              setStarting(true);
              setErrored(false);
              setQrDataUrl(null);
              setMessage(mode === "window" ? "正在重新弹出 Chrome 窗口..." : "正在后台重新抓取二维码...");
              fetch(mode === "window" ? `${apiBase}?mode=window` : apiBase, { method: "POST" })
                .then((r) => r.json())
                .then((data) => {
                  if (mode === "window") {
                    setQrDataUrl(null);
                    setErrored(false);
                  } else if (data.qrDataUrl) {
                    setQrDataUrl(data.qrDataUrl);
                    setErrored(false);
                  } else {
                    setErrored(true);
                  }
                  setMessage(typeof data.message === "string" ? data.message : "未拿到二维码");
                })
                .catch((err) => {
                  setErrored(true);
                  setMessage(`启动登录失败:${err instanceof Error ? err.message : String(err)}`);
                })
                .finally(() => setStarting(false));
            }}
            disabled={starting}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔄 重新加载
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            关闭（登录完成后会自动检测）
          </button>
        </div>
      </div>
    </div>
  );
}
