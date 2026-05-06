/**
 * md-live-preview 对外接口定义
 *
 * 外部项目通过实现 EditorBackend 来对接自己的文件系统、导航、资源管理等能力。
 * 所有方法均可选——未提供的能力会优雅降级（如不提供 listLinkTargets 则 `[[` 补全不弹出）。
 */
export {};
