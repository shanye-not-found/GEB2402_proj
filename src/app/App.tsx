import { useEffect, useReducer, useState } from 'react';
import { EXPERIMENT } from '../config/experiment';
import { makeRecord, transition } from '../domain/experiment';
import { priceFeedback, visibleQuestions } from '../domain/questionnaire';
import type { Catalog, Event, Mode, PublicKeyConfig, Stage } from '../domain/types';
import { loadSession, saveSession, clearSession } from '../services/session';
import { loadResources, prepareExperiment } from '../services/resources';
import { downloadFile, encryptRecord } from '../services/export';
import { ConsentPage } from '../features/consent/ConsentPage';
import { NamePage } from '../features/participant/NamePage';
import { InstructionsPage } from '../features/instructions/InstructionsPage';
import { ShoppingPage } from '../features/shopping/ShoppingPage';
import { ExperimentQuestionsPage } from '../features/estimate/EstimateSteps';
import { QuestionnairePage } from '../features/questionnaire/QuestionnairePage';
import { CompletionPage } from '../features/completion/CompletionPage';

const stageNumbers: Record<Stage, number> = { consent: 1, name: 2, instructions: 3, shopping: 4, price: 5, weight: 5, questionnaire: 6, complete: 7 };

export function App() {
  const query = new URLSearchParams(location.search);
  const mode: Mode = query.get('mode') === 'research' ? 'research' : query.get('demo') === '1' || import.meta.env.DEV ? 'demo' : 'research';
  const [boot] = useState(() => loadSession(EXPERIMENT, mode));
  const [state, dispatch] = useReducer(transition, boot.state);
  const [clock, setClock] = useState(Date.now);
  const [resources, setResources] = useState<{ catalog: Catalog; publicKey: PublicKeyConfig } | null>(null);
  const [resourceError, setResourceError] = useState('');
  const [retry, setRetry] = useState(0);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [saveWarning, setSaveWarning] = useState('');

  useEffect(() => {
    let active = true;
    setResourceError('');
    setResources(null);
    loadResources().then(value => { if (active) setResources(value); }).catch(error => { if (active) setResourceError(error instanceof Error ? error.message : '商品加载失败。'); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (boot.error) return;
    try { saveSession(state); setSaveWarning(''); }
    catch { setSaveWarning('本标签页暂时无法保存进度，请不要刷新；已完成的数据仍可下载。'); }
  }, [state, boot.error]);

  useEffect(() => {
    if (state.stage !== 'shopping') return;
    function tick() { const now = Date.now(); setClock(now); dispatch({ type: 'TICK', now }); }
    function preventLeave(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    tick();
    const timer = window.setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    window.addEventListener('beforeunload', preventLeave);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); window.removeEventListener('beforeunload', preventLeave); };
  }, [state.stage]);

  useEffect(() => { window.scrollTo(0, 0); }, [state.stage]);

  function send(event: Event) { dispatch(event); }

  function acceptConsent() {
    if (!globalThis.crypto?.randomUUID) {
      send({ type: 'ERROR', message: '此环境不支持安全实验记录，请使用HTTPS或localhost。', now: Date.now() });
      return;
    }
    send({ type: 'CONSENT', sessionId: crypto.randomUUID(), now: Date.now() });
  }

  async function startShopping() {
    if (!resources || starting) return;
    setStarting(true);
    try {
      await prepareExperiment(resources.catalog, resources.publicKey, state.mode, state.config);
      const now = Date.now();
      setClock(now);
      send({ type: 'START', catalog: resources.catalog, publicKey: resources.publicKey, viewport: { viewportWidth: innerWidth, viewportHeight: innerHeight }, now });
    } catch (error) { send({ type: 'ERROR', message: error instanceof Error ? error.message : '暂时无法开始，请重试。', now: Date.now() }); }
    finally { setStarting(false); }
  }

  async function exportData() {
    if (exporting || !state.publicKey) return;
    setExporting(true);
    setDownloadStatus('');
    try {
      const record = makeRecord(state);
      const envelope = await encryptRecord(record, state.publicKey);
      downloadFile(JSON.stringify(envelope, null, 2), `GEB2402_${record.sessionId}.geb2402`);
      setDownloadStatus('已发起下载，请检查文件是否保存。');
    } catch (error) { setDownloadStatus(error instanceof Error ? `文件生成失败：${error.message} 请重试。` : '文件生成失败，请重试。'); }
    finally { setExporting(false); }
  }

  function restart() {
    if (!window.confirm('开始新实验会清除本标签页的当前记录。请确认已保存需要的数据文件。')) return;
    try { clearSession(); location.reload(); }
    catch { setSaveWarning('无法清理本标签页的记录，请检查浏览器存储设置后重试。'); }
  }

  let content;
  if (boot.error) content = <section className="panel narrow"><h1>当前记录无法恢复</h1><p role="alert">{boot.error}</p><button onClick={restart}>清除记录并重新开始</button></section>;
  else switch (state.stage) {
    case 'consent': content = <ConsentPage onContinue={acceptConsent} />; break;
    case 'name': content = <NamePage value={state.nameDraft} onChange={value => send({ type: 'NAME_DRAFT', value, now: Date.now() })} onNext={() => send({ type: 'CONFIRM_NAME', now: Date.now() })} onBack={() => send({ type: 'BACK_TO_CONSENT', now: Date.now() })} />; break;
    case 'instructions': content = <InstructionsPage busy={starting} loading={!resources && !resourceError} loadError={resourceError} budgetFen={state.config.budgetFen} onRetry={() => setRetry(value => value + 1)} onStart={startShopping} />; break;
    case 'shopping': content = state.catalog && state.shopping && <ShoppingPage catalog={state.catalog} shopping={state.shopping} now={clock} onChange={(productId, delta, phase) => send({ type: delta === 1 ? 'ADD' : 'REMOVE', productId, phase, now: Date.now() })} onCheckout={phase => send({ type: 'CHECKOUT', phase, now: Date.now() })} />; break;
    case 'price':
    case 'weight': content = <ExperimentQuestionsPage priceDraft={state.priceDraft} weightDraft={state.weightDraft} budgetAnswer={state.budgetPerceptionDraft} priceConfirmed={state.stage === 'weight'} priceFen={state.priceSubmissions.at(-1)?.priceFen ?? null} onPriceChange={value => send({ type: 'PRICE_DRAFT', value, now: Date.now() })} onPriceConfirm={() => send({ type: 'SUBMIT_PRICE', now: Date.now() })} onEditPrice={() => send({ type: 'EDIT_PRICE', now: Date.now() })} onWeightChange={value => send({ type: 'WEIGHT_DRAFT', value, now: Date.now() })} onBudgetChange={value => send({ type: 'BUDGET_PERCEPTION_DRAFT', value, now: Date.now() })} onNext={() => send({ type: 'SUBMIT_WEIGHT', now: Date.now() })} />; break;
    case 'questionnaire': content = <QuestionnairePage feedback={priceFeedback(state)} porkReferenceFen={state.config.porkReferenceFen} questions={visibleQuestions(state)} answers={state.answers} error={state.error} onAnswer={(questionId, value) => send({ type: 'ANSWER', questionId, value, now: Date.now() })} onSubmit={() => send({ type: 'COMPLETE', now: Date.now() })} />; break;
    case 'complete': content = <CompletionPage busy={exporting} status={downloadStatus} onDownload={exportData} onReset={restart} />; break;
  }

  const step = stageNumbers[state.stage];
  return <>
    <header className="site-header"><a href={import.meta.env.BASE_URL} onClick={event => event.preventDefault()} aria-label="GEB2402 小组项目"><strong>GEB2402</strong><span>零食选购实验</span></a><span className="step-label">第 {step} 步 / 共 7 步</span></header>
    <div className="progress-track" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={7} aria-label="实验进度"><div style={{ width: `${step / 7 * 100}%` }} /></div>
    <main>
      {state.mode === 'demo' && <p className="demo-notice">演示模式 · {state.catalog?.products.length ?? resources?.catalog.products.length ?? '…'} 种商品 · 排序选项待确认</p>}
      {saveWarning && <p className="notice error" role="alert">{saveWarning}</p>}
      {state.error && state.stage !== 'questionnaire' && <p className="notice error" role="alert">{state.error}</p>}
      {content}
    </main>
    <footer>GEB2402 小组项目 · 数据仅用于本项目</footer>
  </>;
}
