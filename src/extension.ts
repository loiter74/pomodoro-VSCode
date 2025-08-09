// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// 番茄钟状态接口
interface PomodoroState {
    isActive: boolean;
    isPaused: boolean;     // 新增：暂停状态
    startTime: number;
    pausedTime: number;    // 新增：暂停时累计的已用时间
    totalDuration: number; // 90分钟 = 5400000毫秒
    intervalMin: number;   // 最小间隔3分钟
    intervalMax: number;   // 最大间隔5分钟
    restDuration: number;  // 休息10秒
}

// 全局状态
let pomodoroState: PomodoroState = {
    isActive: false,
    isPaused: false,
    startTime: 0,
    pausedTime: 0,
    totalDuration: 90 * 60 * 1000, // 90分钟
    intervalMin: 3 * 60 * 1000,    // 3分钟
    intervalMax: 5 * 60 * 1000,    // 5分钟
    restDuration: 10 * 1000        // 10秒
};

let currentTimer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "pomodoro" is now active!');

    // 创建状态栏项目
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "🍅 番茄钟: 未启动";
    statusBarItem.tooltip = "点击启动番茄钟";
    statusBarItem.command = 'pomodoro.toggle';
    statusBarItem.show();

    // 注册命令：启动/停止番茄钟
    const toggleCommand = vscode.commands.registerCommand('pomodoro.toggle', () => {
        if (pomodoroState.isActive && !pomodoroState.isPaused) {
            pausePomodoro();
        } else if (pomodoroState.isPaused) {
            resumePomodoro();
        } else {
            startPomodoro();
        }
    });

    // 注册命令：手动休息
    const restCommand = vscode.commands.registerCommand('pomodoro.rest', () => {
        if (pomodoroState.isActive && !pomodoroState.isPaused) {
            triggerRestBreak();
        }
    });

    // 注册命令：重置番茄钟
    const resetCommand = vscode.commands.registerCommand('pomodoro.reset', () => {
        resetPomodoro();
    });

    context.subscriptions.push(toggleCommand, restCommand, resetCommand, statusBarItem);
}

// 启动番茄钟
function startPomodoro() {
    pomodoroState.isActive = true;
    pomodoroState.isPaused = false;
    pomodoroState.startTime = Date.now();
    pomodoroState.pausedTime = 0;
    
    updateStatusBar();
    scheduleNextBreak();
    
    vscode.window.setStatusBarMessage('🍅 番茄钟已启动！将在90分钟后自动结束。', 10000);
}

// 暂停番茄钟
function pausePomodoro() {
    if (!pomodoroState.isActive || pomodoroState.isPaused) {return;}
    
    pomodoroState.isPaused = true;
    
    // 累计已用时间
    pomodoroState.pausedTime += Date.now() - pomodoroState.startTime;
    
    // 清除当前计时器
    if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = undefined;
    }
    
    updateStatusBar();
    vscode.window.setStatusBarMessage('⏸️ 番茄钟已暂停！', 3000);
}

// 恢复番茄钟
function resumePomodoro() {
    if (!pomodoroState.isActive || !pomodoroState.isPaused) {return;}
    
    pomodoroState.isPaused = false;
    pomodoroState.startTime = Date.now(); // 重新设置开始时间
    
    updateStatusBar();
    scheduleNextBreak();
    
    // 短暂的信息提示
    vscode.window.setStatusBarMessage('▶️ 番茄钟已恢复！', 3000);
}

// 停止番茄钟（完全停止，用于重置）
function stopPomodoro() {
    pomodoroState.isActive = false;
    pomodoroState.isPaused = false;
    
    if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = undefined;
    }
    
    updateStatusBar();
}

// 重置番茄钟
function resetPomodoro() {
    stopPomodoro();
    pomodoroState.startTime = 0;
    pomodoroState.pausedTime = 0;
    updateStatusBar();
    vscode.window.setStatusBarMessage('🍅 番茄钟已重置！', 3000);
}

// 获取总的已用时间
function getElapsedTime(): number {
    if (pomodoroState.isPaused) {
        return pomodoroState.pausedTime;
    } else {
        return pomodoroState.pausedTime + (Date.now() - pomodoroState.startTime);
    }
}

// 触发休息提醒
function triggerRestBreak() {
    if (!pomodoroState.isActive || pomodoroState.isPaused) {return;}

    // 播放提示音（通过信息框模拟）
    playNotificationSound();
    
    // 显示休息提醒 - 2秒后自动消失
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "⏰ 休息时间到了！请休息10秒钟～",
        cancellable: false
    }, async (progress) => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(undefined);
                startRestCountdown(); // 2秒后开始休息倒计时
            }, 3000);
        });
    });
}

// 开始休息倒计时
function startRestCountdown() {
    let countdown = 10;
    
    const countdownInterval = setInterval(() => {
        if (!pomodoroState.isActive || pomodoroState.isPaused) {
            clearInterval(countdownInterval);
            return;
        }
        vscode.window.setStatusBarMessage(`🍅 休息中...`, 10000);
        if (countdown > 0) {
            countdown--;
        } else {
            clearInterval(countdownInterval);
            // 使用Progress API显示休息结束提醒
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "✨ 休息结束，继续加油！",
                cancellable: false
            }, async (progress) => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(undefined);
                        scheduleNextBreak(); 
                    }, 0);
                });
            });
        }
    }, 1000);
}

// 安排下一次休息
function scheduleNextBreak() {
    if (!pomodoroState.isActive || pomodoroState.isPaused) {return;}

    // 检查是否已经到达90分钟
    const elapsed = getElapsedTime();
    if (elapsed >= pomodoroState.totalDuration) {
        endPomodoro();
        return;
    }

    // 计算随机间隔时间（3-5分钟）
    const randomInterval = Math.random() * (pomodoroState.intervalMax - pomodoroState.intervalMin) + pomodoroState.intervalMin;
    
    currentTimer = setTimeout(() => {
        if (pomodoroState.isActive && !pomodoroState.isPaused) {
            triggerRestBreak();
        }
    }, randomInterval);
}



// 结束番茄钟（90分钟到达）
function endPomodoro() {
    pomodoroState.isActive = false;
    pomodoroState.isPaused = false;
    
    if (currentTimer) {
        clearTimeout(currentTimer);
        currentTimer = undefined;
    }
    
    updateStatusBar();
    
    // 播放结束提示音
    playNotificationSound();
    
    vscode.window.showInformationMessage(
        '🎉 恭喜！番茄钟90分钟已完成！', 
        '再来一轮',
        '关闭'
    ).then(selection => {
        if (selection === '再来一轮') {
            startPomodoro();
        }
    });
}

// 更新状态栏
function updateStatusBar() {
    if (!pomodoroState.isActive) {
        statusBarItem.text = "🍅 番茄钟: 未启动";
        statusBarItem.tooltip = "点击启动番茄钟";
        return;
    }
    
    if (pomodoroState.isPaused) {
        const elapsed = getElapsedTime();
        const remaining = pomodoroState.totalDuration - elapsed;
        const minutes = Math.floor(remaining / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        
        statusBarItem.text = `⏸️ 番茄钟: ${minutes}:${seconds.toString().padStart(2, '0')} (已暂停)`;
        statusBarItem.tooltip = `已暂停 - 剩余时间: ${minutes}分${seconds}秒\n点击恢复番茄钟`;
        return;
    }
    
    const elapsed = getElapsedTime();
    const remaining = pomodoroState.totalDuration - elapsed;
    
    if (remaining <= 0) {
        endPomodoro();
        return;
    }
    
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    statusBarItem.text = `🍅 番茄钟: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    statusBarItem.tooltip = `剩余时间: ${minutes}分${seconds}秒\n点击暂停番茄钟`;
    
    // 每秒更新一次（只在运行状态下）
    setTimeout(() => {
        if (pomodoroState.isActive && !pomodoroState.isPaused) {
            updateStatusBar();
        }
    }, 1000);
}

// 播放通知声音（模拟）
function playNotificationSound() {
    // 在VS Code中，我们通过多个信息提示来模拟声音效果

}

// This method is called when your extension is deactivated
export function deactivate() {
    if (currentTimer) {
        clearTimeout(currentTimer);
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}