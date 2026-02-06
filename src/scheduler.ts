/**
 * タスクスケジューラー
 * 各タスクを独立した間隔で実行
 */

import { createLogger } from './logger';

const log = createLogger('scheduler');

export interface TaskConfig {
  /** タスク名 */
  name: string;
  /** 実行する関数 */
  fn: () => Promise<void>;
  /** 最小間隔（分） */
  intervalMin: number;
  /** 最大間隔（分） */
  intervalMax: number;
  /** 有効かどうか（時間帯などで制御） */
  enabled?: () => boolean;
  /** 起動時に即時実行するか（デフォルト: true） */
  runOnStart?: boolean;
}

interface TaskState {
  config: TaskConfig;
  lastRun: Date | null;
  nextRun: Date;
  timerId: ReturnType<typeof setTimeout> | null;
  isRunning: boolean;
}

export class TaskScheduler {
  private tasks: Map<string, TaskState> = new Map();
  private running = false;

  /**
   * タスクを登録
   */
  register(config: TaskConfig): void {
    if (this.tasks.has(config.name)) {
      throw new Error(`Task "${config.name}" is already registered`);
    }

    const state: TaskState = {
      config,
      lastRun: null,
      nextRun: new Date(), // 即時実行可能
      timerId: null,
      isRunning: false,
    };

    this.tasks.set(config.name, state);
    log.debug(
      `📋 タスク登録: ${config.name} (${config.intervalMin}〜${config.intervalMax}分)`,
    );
  }

  /**
   * スケジューラー開始
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    log.info('🚀 スケジューラー開始');

    // 起動時に即時実行するタスクを順次実行
    for (const [name, state] of this.tasks) {
      const runOnStart = state.config.runOnStart ?? true;
      if (runOnStart) {
        await this.runTask(name, state, true);
      } else {
        // 即時実行しない場合は次回をスケジュール
        this.scheduleTask(name, state);
      }
    }
  }

  /**
   * スケジューラー停止
   */
  stop(): void {
    this.running = false;

    for (const state of this.tasks.values()) {
      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
    }

    log.info('🛑 スケジューラー停止');
  }

  /**
   * 次の実行をスケジュール
   */
  private scheduleTask(name: string, state: TaskState): void {
    if (!this.running) return;

    const { config } = state;
    const now = new Date();

    // 次の実行時刻を計算（ランダムな間隔）
    const intervalMs = this.getRandomInterval(
      config.intervalMin,
      config.intervalMax,
    );
    const nextRun = new Date(now.getTime() + intervalMs);
    state.nextRun = nextRun;

    const delayMs = Math.max(0, nextRun.getTime() - now.getTime());
    const delayMin = Math.round(delayMs / 60000);

    log.info(`⏰ ${name}: 次回は約${delayMin}分後`);

    state.timerId = setTimeout(async () => {
      await this.runTask(name, state, false);
    }, delayMs);
  }

  /**
   * タスクを実行
   */
  private async runTask(
    name: string,
    state: TaskState,
    isInitial: boolean,
  ): Promise<void> {
    if (!this.running) return;

    // 既に実行中なら待機（同一タスクの重複実行防止）
    if (state.isRunning) {
      log.warn(`⚠️ ${name}: 前回の実行がまだ完了していないばい`);
      this.scheduleTask(name, state);
      return;
    }

    const { config } = state;

    // enabled チェック（時間帯制限など）
    if (config.enabled && !config.enabled()) {
      log.info(`⏸️ ${name}: 現在無効（スキップ）`);
      this.scheduleTask(name, state);
      return;
    }

    const prefix = isInitial ? '🚀' : '▶️';
    log.debug(`${prefix} ${name}: 実行開始`);
    const startTime = Date.now();

    state.isRunning = true;

    try {
      await config.fn();
      state.lastRun = new Date();

      const elapsed = Date.now() - startTime;
      log.debug(`✅ ${name}: 完了 (${elapsed}ms)`);
    } catch (error) {
      log.error({ err: error }, `❌ ${name}: エラー`);
    } finally {
      state.isRunning = false;
    }

    // 次をスケジュール
    this.scheduleTask(name, state);
  }

  /**
   * ランダムな間隔を取得（ミリ秒）
   */
  private getRandomInterval(minMinutes: number, maxMinutes: number): number {
    const minMs = minMinutes * 60 * 1000;
    const maxMs = maxMinutes * 60 * 1000;
    return minMs + Math.random() * (maxMs - minMs);
  }

  /**
   * 状態を取得（デバッグ用）
   */
  getStatus(): Record<
    string,
    { lastRun: Date | null; nextRun: Date; isRunning: boolean }
  > {
    const status: Record<
      string,
      { lastRun: Date | null; nextRun: Date; isRunning: boolean }
    > = {};
    for (const [name, state] of this.tasks) {
      status[name] = {
        lastRun: state.lastRun,
        nextRun: state.nextRun,
        isRunning: state.isRunning,
      };
    }
    return status;
  }
}
