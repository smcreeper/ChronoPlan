import React, { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, CheckCircle2, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'card' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'card' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'compact') return null;
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>已作为独立应用安装到主屏幕</span>
      </div>
    );
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className={
            variant === 'compact'
              ? 'inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0'
              : 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap'
          }
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>添加到主屏幕</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={
            variant === 'compact'
              ? 'inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0'
              : 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap'
          }
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{isIOS ? 'iOS 添加到主屏幕指引' : '安装到手机桌面指引'}</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-6 pb-safe shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                添加到手机主屏幕
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="space-y-1.5">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  iPhone / iPad (Safari 浏览器)
                </p>
                <ol className="space-y-2 text-xs leading-relaxed">
                  <li className="flex items-start gap-2">
                    <Share className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>1. 点击浏览器底部工具栏中的「分享」图标。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PlusSquare className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>2. 向下滚动菜单，选择「添加到主屏幕」并点击「添加」。</span>
                  </li>
                </ol>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Android (Chrome / Edge 浏览器)
                </p>
                <p className="text-xs leading-relaxed">
                  点击浏览器右上角菜单（⋮），选择「安装应用」或「添加到主屏幕」，即可作为独立离线应用启动。
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
};
