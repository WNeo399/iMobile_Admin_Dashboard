// 中文 — Chinese messages.
//
// `menu` translates sidebar / tab / breadcrumb titles and is keyed by the
// EXACT English title from the router (via the $tt helper, which falls back
// to the raw title when a key is missing — so untranslated entries simply
// stay English, never break). Brand and product names (iMobile, InFlow,
// Blackbelt, SQT, Reebelo, ExEngine) deliberately stay as they are.
//
// `common` is the shared dictionary for page-by-page sweeps: pages use
// $t('common.search') etc. so the same word is translated once.

export default {
  menu: {
    'Home': '首页',
    'Dashboard': '仪表盘',

    'Spare Parts': '维修零件',
    'Stock Monitoring': '库存监控',
    'Stock Dashboard': '库存看板',
    'Collections': '产品集合',
    'Purchase Order': '采购订单',
    'Catalogue': '产品目录',
    'Products': '产品',
    'Reference Data': '基础数据',
    'Accessories': '配件',
    'Repair': '维修',
    'Credit Note': '贷记单',
    'Special Order': '特殊订单',
    'Serials Lookup': '序列号查询',
    'Serials': '序列号',
    'Enquiries': '查询记录',
    'Widget Setting': '组件设置',
    'Exploded Diagrams': '爆炸图',
    'Tools': '工具',

    'Sales Orders': '销售订单',
    'Order Dispatch': '订单发货',
    'Owing Stocks': '欠货库存',
    'SKU Mapping': 'SKU 映射',
    'Customers': '客户',
    'Customer': '客户',
    'Statement': '对账单',
    'Dispatch Status': '发货状态',
    'Order History': '订单历史',
    'My Devices': '我的设备',

    'Refurbished Device': '翻新设备',
    'Sales': '销售',
    'Stock': '库存',
    'Sales Return': '销售退货',
    'Warehouse': '仓库',
    'Incoming Stocks': '入库批次',
    'Supply Batches': '供货批次',
    'For Repair': '待维修',
    'Repairers': '维修商',
    'Consignment': '寄售',
    'Insights': '概览',
    'Devices': '设备',
    'Shops': '店铺',

    'Accounts': '账户',
    'Invoices': '发票',
    'Cases': '工单',
    'Models': '机型',
    'Model Detail': '机型详情',
    'Overview': '总览',
    'Returns': '退回',
    'Scraper': '数据抓取',
    'Location Monitoring': '位置监控',
    'Embed Ordering': '嵌入订购',
    'Distributors': '分销商',

    'System': '系统',
    'Users': '用户',
    'AI Agent': 'AI 助手',
    'Agent Skills': '助手技能',
    '个人中心': '个人中心'
  },
  common: {
    search: '搜索',
    reset: '重置',
    add: '新增',
    edit: '编辑',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    close: '关闭',
    confirm: '确认',
    refresh: '刷新',
    export: '导出',
    download: '下载',
    upload: '上传',
    print: '打印',
    detail: '详情',
    view: '查看',
    actions: '操作',
    status: '状态',
    date: '日期',
    total: '合计',
    subtotal: '小计',
    price: '价格',
    quantity: '数量',
    remark: '备注',
    yes: '是',
    no: '否',
    all: '全部',
    loading: '加载中…',
    noData: '暂无数据',
    success: '操作成功',
    failed: '操作失败'
  }
}
