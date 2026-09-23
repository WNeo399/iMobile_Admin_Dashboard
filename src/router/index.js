import Vue from "vue";
import Router from "vue-router";

Vue.use(Router);

/* Layout */
import Layout from "@/layout";

/**
 * Note: 路由配置项
 *
 * hidden: true                     // 当设置 true 的时候该路由不会再侧边栏出现 如401，login等页面，或者如一些编辑页面/edit/1
 * alwaysShow: true                 // 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面
 *                                  // 只有一个时，会将那个子路由当做根路由显示在侧边栏--如引导页面
 *                                  // 若你想不管路由下面的 children 声明的个数都显示你的根路由
 *                                  // 你可以设置 alwaysShow: true，这样它就会忽略之前定义的规则，一直显示根路由
 * redirect: noRedirect             // 当设置 noRedirect 的时候该路由在面包屑导航中不可被点击
 * name:'router-name'               // 设定路由的名字，一定要填写不然使用<keep-alive>时会出现各种问题
 * query: '{"id": 1, "name": "ry"}' // 访问路由的默认传递参数
 * roles: ['admin', 'common']       // 访问路由的角色权限
 * permissions: ['a:a:a', 'b:b:b']  // 访问路由的菜单权限
 * meta : {
    noCache: true                   // 如果设置为true，则不会被 <keep-alive> 缓存(默认 false)
    title: 'title'                  // 设置该路由在侧边栏和面包屑中展示的名字
    icon: 'svg-name'                // 设置该路由的图标，对应路径src/assets/icons/svg
    breadcrumb: false               // 如果设置为false，则不会在breadcrumb面包屑中显示
    activeMenu: '/system/user'      // 当路由设置了该属性，则会高亮相对应的侧边栏。
  }
 */

// 公共路由
export const constantRoutes = [
  {
    path: "/redirect",
    component: Layout,
    hidden: true,
    children: [
      {
        path: "/redirect/:path(.*)",
        component: () => import("@/views/redirect"),
      },
    ],
  },
  {
    path: "/login",
    component: () => import("@/views/login"),
    hidden: true,
  },
  {
    path: "/404",
    component: () => import("@/views/error/404"),
    hidden: true,
  },
  {
    path: "/401",
    component: () => import("@/views/error/401"),
    hidden: true,
  },
  {
    path: "",
    component: Layout,
    redirect: "index",
    children: [
      {
        path: "index",
        component: () => import("@/views/index"),
        name: "Index",
        meta: { title: "Home", icon: "dashboard", affix: true },
      },
    ],
  },
  {
    path: "/user",
    component: Layout,
    hidden: true,
    redirect: "noredirect",
    children: [
      {
        path: "profile",
        component: () => import("@/views/system/user/profile/index"),
        name: "Profile",
        meta: { title: "个人中心", icon: "user" },
      },
    ],
  },
];

// Permission-gated module routes. These are registered in the router (so they
// are navigable) but the sidebar only shows the ones the user's permissions
// allow, and the router guard blocks direct-URL access to forbidden routes.
// `meta.permissions` lists the permission(s) that grant access to a route.
export const moduleRoutes = [
  {
    // iMobile group — top-level umbrella for iMobile-specific modules.
    // Spare Parts lived here until 2026-09, when it was promoted to its own
    // top-level "iMobile Spare Parts" menu (below) like Accessories before it.
    path: "/imobile",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "iMobile", icon: "el-icon-goods" },
    children: [
      // (The Tencent-sheet Purchase Order page — this role's flattened
      // entry here and the one under iMobile Spare Parts — was retired on
      // 2026-09-23: purchasing runs in Spare Parts Purchase.)
      {
        // iMobile Repair — sibling of Inventory under the iMobile group.
        // Visible to iMobile Admin (zoho:*:* gets repair:*:* alongside) and
        // iMobile Repair Admin (which is named for this page).
        path: "repair",
        component: (resolve) => require(["@/views/imobile/repair/index"], resolve),
        name: "ImobileRepair",
        meta: {
          title: "Repair",
          icon: "el-icon-s-tools",
          permissions: ["repair:ticket:list"]
        }
      },
      {
        // Credit Note — browse / search the imb_credit_note collection
        // built up by the Tools-page Create Credit Note submit flow.
        // Reuses the zoho:salesOrder:create permission, since admin +
        // iMobile Admin both already hold it and that's exactly who can
        // submit a credit note in the first place.
        path: "creditNote",
        component: (resolve) => require(["@/views/imobile/creditNote/index"], resolve),
        name: "ImobileCreditNote",
        meta: {
          title: "Credit Note",
          icon: "el-icon-receiving",
          permissions: ["zoho:salesOrder:create"]
        }
      },
      {
        // Special Order — review the imb_special_orders collection
        // populated by the embeddable Special Order widget shipped
        // out of the iMobile_Widget repo (POST /widget/specialOrder
        // on the backend). Same permission gate as Credit Note so
        // the same role can triage incoming customer requests.
        path: "specialOrder",
        component: (resolve) => require(["@/views/imobile/specialOrder/index"], resolve),
        name: "ImobileSpecialOrder",
        meta: {
          title: "Special Order",
          icon: "el-icon-shopping-cart-2",
          // ANY-match: the original zoho gate (admin / iMobile Admin) OR the
          // dedicated po:specialOrder:view held by the iMobile Purchase role
          // (which must NOT get zoho:salesOrder:create — that would also
          // unlock the Credit Note page).
          permissions: ["zoho:salesOrder:create", "po:specialOrder:view"]
        }
      },
      {
        // Serials Lookup — the Apple SVP feature: the genuine-serial list
        // (uploaded from the supplier's sheet) the public lookup site checks
        // against, plus the customer enquiries it generates. Grouped as a
        // submenu via ParentView, like Catalogue.
        path: "svp",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Serials Lookup", icon: "el-icon-search" },
        children: [
          {
            path: "/imobile/svp/serials",
            component: (resolve) => require(["@/views/imobile/svp/serials"], resolve),
            name: "ImobileSvpSerials",
            meta: {
              title: "Serials",
              icon: "el-icon-files",
              permissions: ["svp:serial:view"]
            }
          },
          {
            path: "/imobile/svp/enquiries",
            component: (resolve) => require(["@/views/imobile/svp/enquiries"], resolve),
            name: "ImobileSvpEnquiry",
            meta: {
              title: "Enquiries",
              icon: "el-icon-chat-dot-round",
              permissions: ["svp:enquiry:view"]
            }
          }
        ]
      },
    ]
  },
  {
    // iMobile Spare Parts — the former iMobile → Spare Parts submenu,
    // promoted out of the iMobile group to its own top-level menu (2026-09),
    // sitting between iMobile and iMobile Accessories.
    //
    // Page paths stay `/zohoInventory/...` and `/imobile/...` so existing
    // deep links and the home-page quick-action links (which reference
    // `/zohoInventory/stockMonitoring` etc.) keep working — only the
    // sidebar / routing layer moved.
    path: "/imobileSpareParts",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "iMobile Spare Parts", icon: "el-icon-notebook-2" },
    children: [
      {
        path: "/zohoInventory/stockMonitoring",
        component: (resolve) => require(["@/views/zohoInventory/stockmonitoring"], resolve),
        name: "StockMonitoring",
        meta: {
          title: "Stock Monitoring",
          // Chart/line icon reads as "monitoring" at a glance — better
          // than the previous `goods` value which had no matching SVG
          // sprite and rendered blank.
          icon: "el-icon-data-line",
          permissions: ["zoho:stock:view"]
        }
      },
      {
        // The snapshot dashboard now lives INSIDE Stock Monitoring (the
        // Dashboard tab above the category tree, and the page's landing
        // view) — this hidden redirect keeps old deep links working.
        // It must carry the target's permission: a permission-less child
        // survives the route filter for EVERY user, which kept this whole
        // group on the sidebar (empty) for roles with no access to it.
        path: "/zohoInventory/stockDashboard",
        redirect: "/zohoInventory/stockMonitoring",
        hidden: true,
        meta: { permissions: ["zoho:stock:view"] }
      },
      {
        // All spare-parts SKUs with the four price-list rates from the
        // daily snapshot, plus price-health tiles (missing / placeholder /
        // below cost / wrong order).
        path: "/zohoInventory/priceMonitoring",
        component: (resolve) => require(["@/views/zohoInventory/priceMonitoring"], resolve),
        name: "PriceMonitoring",
        meta: {
          title: "Price Monitoring",
          icon: "el-icon-money",
          permissions: ["zoho:stock:view"]
        }
      },
      {
        // Spare parts with no product image in Zoho, from the daily
        // snapshot's imageId (null = no image). Per-row upload to Zoho.
        path: "/zohoInventory/missingImages",
        component: (resolve) => require(["@/views/zohoInventory/missingImages"], resolve),
        name: "MissingImages",
        meta: {
          title: "Missing Images",
          icon: "el-icon-picture-outline",
          permissions: ["zoho:stock:view"]
        }
      },
      {
        // Retired from the sidebar (2026-09) — collections are managed on
        // the Stock Monitoring tree now (⋯ menus + the Manage Category
        // gear). The route stays navigable for old links/bookmarks.
        path: "/zohoInventory/collections",
        component: (resolve) => require(["@/views/products/collection"], resolve),
        name: "Collections",
        hidden: true,
        meta: {
          title: "Collections",
          permissions: ["zoho:collection:view"]
        }
      },
      {
        // Catalogue — the IMB parts catalogue (imb_products + its
        // brand/category/model/quality reference data). Nested submenu
        // via ParentView (a transparent <router-view /> wrapper used by
        // RuoYi/vue-element-admin to render nested submenu groups without
        // adding a real page in the middle). Reuses the collection
        // permissions since the same iMobile Admin role manages this
        // product data. Page paths stay absolute (/imobile/catalogue/...)
        // so existing links keep working.
        path: "catalogue",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Catalogue", icon: "el-icon-collection" },
        children: [
          {
            path: "/imobile/catalogue/products",
            component: (resolve) => require(["@/views/imobile/catalogue/products"], resolve),
            name: "CatalogueProducts",
            meta: {
              title: "Products",
              icon: "el-icon-goods",
              permissions: ["zoho:collection:view"]
            }
          },
          {
            path: "/imobile/catalogue/reference",
            component: (resolve) => require(["@/views/imobile/catalogue/reference"], resolve),
            name: "CatalogueReference",
            meta: {
              title: "Reference Data",
              icon: "el-icon-s-operation",
              permissions: ["zoho:collection:view"]
            }
          }
        ]
      }
    ]
  },
  {
    // Spare Parts Purchase — the in-app purchase process (2026-09): what
    // iMobile asks for, what the purchase partner buys and ships, what
    // arrives. Replaces the sheet-backed iMobile → Purchase Order page once
    // its open orders are imported. Shared by admin, iMobile Admin and the
    // Parts Supplier role (spp:* permissions).
    path: "/sparePartsPurchase",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "Spare Parts Purchase", icon: "el-icon-shopping-cart-2" },
    children: [
      {
        path: "orders",
        component: (resolve) => require(["@/views/sparePartsPurchase/orders"], resolve),
        name: "SppOrders",
        meta: {
          title: "Purchase Order",
          icon: "el-icon-notebook-2",
          permissions: ["spp:order:view"]
        }
      },
      {
        // 下单批次: pending lines placed with one supplier, the list sent to
        // them, and their quoted prices keyed back in.
        path: "order-batches",
        component: (resolve) => require(["@/views/sparePartsPurchase/orderBatches"], resolve),
        name: "SppOrderBatches",
        meta: {
          title: "Order Batches",
          icon: "el-icon-document-checked",
          permissions: ["spp:order:supply"]
        }
      },
      {
        path: "batches",
        component: (resolve) => require(["@/views/sparePartsPurchase/batches"], resolve),
        name: "SppBatches",
        meta: {
          title: "Batches",
          icon: "el-icon-truck",
          permissions: ["spp:batch:view"]
        }
      }
    ]
  },
  {
    // iMobile Accessories — promoted out of the iMobile group to its own
    // top-level menu (2026-09). Same Stock Monitoring / Collections
    // functionality as Spare Parts but over its own collection set
    // (meta.scope switches the data source in the shared pages/API).
    // Deliberately no Tencent purchase-order integration and no Create PO.
    // Page paths keep /imobile/accessories/... so existing deep links
    // keep working.
    path: "/imobileAccessories",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "iMobile Accessories", icon: "el-icon-headset" },
    children: [
      {
        path: "/imobile/accessories/stockMonitoring",
        component: (resolve) => require(["@/views/accessories/stockmonitoring"], resolve),
        name: "AccessoryStockMonitoring",
        meta: {
          title: "Stock Monitoring",
          icon: "el-icon-data-line",
          permissions: ["zoho:stock:view"],
          scope: "accessories"
        }
      },
      {
        path: "/imobile/accessories/collections",
        component: (resolve) => require(["@/views/accessories/collection"], resolve),
        name: "AccessoryCollections",
        meta: {
          title: "Collections",
          icon: "el-icon-files",
          permissions: ["zoho:collection:view"],
          scope: "accessories"
        }
      }
    ]
  },
  {
    path: "/sqt",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "SQT", icon: "el-icon-s-cooperation" },
    children: [
      {
        path: "cases",
        component: (resolve) => require(["@/views/sqt/cases/index"], resolve),
        name: "SqtCases",
        meta: {
          title: "Cases",
          icon: "el-icon-tickets",
          permissions: ["sqt:case:list"]
        }
      },
      {
        // Return tracking dashboard — outstanding parts/devices to recover
        // from shops on terminal cases. HQ-only (sqt:case:trackReturn), so the
        // menu link is hidden from shop roles.
        path: "returns",
        component: (resolve) => require(["@/views/sqt/returns/index"], resolve),
        name: "SqtReturns",
        meta: {
          title: "Returns",
          icon: "el-icon-refresh-left",
          permissions: ["sqt:case:trackReturn"]
        }
      },
      {
        path: "shops",
        component: (resolve) => require(["@/views/sqt/shops/index"], resolve),
        name: "SqtShops",
        meta: {
          title: "Shops",
          icon: "el-icon-office-building",
          permissions: ["sqt:shop:list"]
        }
      },
      {
        path: "models",
        component: (resolve) => require(["@/views/sqt/models/index"], resolve),
        name: "SqtModels",
        meta: {
          title: "Models",
          // CPU icon reads as "device spec sheet" and keeps Models visually
          // distinct from the iMobile parent (which uses mobile-phone).
          icon: "el-icon-cpu",
          permissions: ["sqt:model:list"]
        }
      },
      {
        path: "models/:id",
        component: (resolve) => require(["@/views/sqt/models/detail"], resolve),
        name: "SqtModelDetail",
        hidden: true,
        meta: {
          title: "Model Detail",
          activeMenu: "/sqt/models",
          permissions: ["sqt:model:list"]
        }
      }
    ]
  },
  {
    // InFlow — sales orders + customers, ingested via the public webhook
    // (/integration/inflow). Admin + iMobile Admin view; recording payments is
    // Admin-only (inflow:order:payment).
    path: "/inflow",
    component: Layout,
    redirect: "/inflow/salesOrders",
    alwaysShow: true,
    meta: { title: "InFlow", icon: "el-icon-money" },
    children: [
      {
        path: "salesOrders",
        component: (resolve) => require(["@/views/inflow/salesOrders"], resolve),
        name: "InflowSalesOrders",
        meta: {
          title: "Sales Orders",
          icon: "el-icon-s-order",
          permissions: ["inflow:order:view"]
        }
      },
      {
        path: "orderDispatch",
        component: (resolve) => require(["@/views/inflow/orderDispatch"], resolve),
        name: "InflowOrderDispatch",
        meta: {
          title: "Order Dispatch",
          icon: "el-icon-box",
          permissions: ["inflow:order:view"]
        }
      },
      {
        path: "owingStocks",
        component: (resolve) => require(["@/views/inflow/owingStocks"], resolve),
        name: "InflowOwingStocks",
        meta: {
          title: "Owing Stocks",
          icon: "el-icon-warning-outline",
          permissions: ["inflow:order:view"]
        }
      },
      {
        path: "skuMapping",
        component: (resolve) => require(["@/views/inflow/skuMapping"], resolve),
        name: "InflowSkuMapping",
        meta: {
          title: "SKU Mapping",
          icon: "el-icon-collection-tag",
          permissions: ["inflow:order:view"]
        }
      },
      {
        path: "customers",
        component: (resolve) => require(["@/views/inflow/customers"], resolve),
        name: "InflowCustomers",
        meta: {
          title: "Customer",
          icon: "el-icon-user",
          permissions: ["inflow:customer:view"]
        }
      }
    ]
  },
  {
    // Statement — reached via a button, not the sidebar (hidden), because the
    // admin role is a super-user that would otherwise see every gated route.
    // Dual-mode: a portal login opens their OWN statement (no query); an admin
    // opens a customer's via ?customer=<name> from the Customer page.
    path: "/statement",
    component: Layout,
    hidden: true,
    redirect: "/statement/index",
    children: [
      {
        path: "index",
        component: (resolve) => require(["@/views/inflow/statement"], resolve),
        name: "InflowStatement",
        meta: {
          title: "Statement",
          icon: "el-icon-document",
          activeMenu: "/inflow/customers",
          permissions: ["inflow:statement:view"]
        }
      }
    ]
  },
  {
    // InFlow customer portal — Dispatch Status: read-only view of the
    // dispatch records linked to the logged-in customer (uploaded lists +
    // their mapped sales orders).
    path: "/portal/dispatch",
    component: Layout,
    meta: { exclusiveRoles: ["inflow-customer"] },
    children: [
      {
        path: "index",
        component: (resolve) => require(["@/views/inflow/portalDispatch"], resolve),
        name: "InflowPortalDispatch",
        meta: { title: "Dispatch Status", icon: "el-icon-box" }
      }
    ]
  },
  {
    // InFlow customer portal — Order History. `exclusiveRoles` gates it to
    // inflow-customer WITHOUT the admin super-user bypass, so it shows on the
    // customer's sidebar but never the admin's (where it would render empty).
    path: "/portal/orders",
    component: Layout,
    meta: { exclusiveRoles: ["inflow-customer"] },
    children: [
      {
        path: "index",
        component: (resolve) => require(["@/views/inflow/orderHistory"], resolve),
        name: "InflowOrderHistory",
        meta: { title: "Order History", icon: "el-icon-tickets" }
      }
    ]
  },
  {
    // InFlow customer portal — My Devices: refurbished devices sold to the
    // customer, via the inflow-customer → refurb-customer link. The page
    // shows a friendly empty state when the account isn't linked.
    path: "/portal/devices",
    component: Layout,
    meta: { exclusiveRoles: ["inflow-customer"] },
    children: [
      {
        path: "index",
        component: (resolve) => require(["@/views/inflow/myDevices"], resolve),
        name: "InflowMyDevices",
        meta: { title: "My Devices", icon: "el-icon-mobile-phone" }
      }
    ]
  },
  {
    // InFlow customer portal — Statement (the same statement.vue an admin opens
    // via ?customer=; here with no query, so it loads the caller's OWN account).
    path: "/portal/statement",
    component: Layout,
    meta: { exclusiveRoles: ["inflow-customer"] },
    children: [
      {
        path: "index",
        component: (resolve) => require(["@/views/inflow/statement"], resolve),
        name: "InflowPortalStatement",
        meta: { title: "Statement", icon: "el-icon-document" }
      }
    ]
  },
  {
    // Refurbished Device — rebuilt around the Stock page (the old Scraper /
    // AI pages now live under ExEngine and System). refurb:stock:view =
    // admin + iMobile Admin (refurb:*:*); grant it to widen.
    path: "/refurbishedPhones",
    component: Layout,
    redirect: "noRedirect",
    alwaysShow: true,
    meta: { title: "Refurbished Device", icon: "el-icon-mobile-phone" },
    // Three sub menus. Leaf paths stay absolute (/refurbished/... and
    // /consignment/...) so existing deep links and bookmarks keep working —
    // only the sidebar nesting changes.
    children: [
      {
        // The register itself sits at the top level — it is the anchor
        // every sub menu below works against.
        path: "/refurbished/stock",
        component: (resolve) => require(["@/views/refurbished/stock"], resolve),
        name: "RefurbishedStock",
        meta: {
          title: "Stock",
          icon: "el-icon-box",
          permissions: ["refurb:stock:view"]
        }
      },
      {
        // A phone supplier's own upstream suppliers — where their stock
        // comes from. Data is scoped server-side to their stock source;
        // exclusiveRoles keeps the page off every staff sidebar.
        path: "/refurbished/suppliers",
        component: (resolve) => require(["@/views/refurbished/suppliers"], resolve),
        name: "RefurbishedSuppliers",
        meta: {
          title: "Suppliers",
          icon: "el-icon-office-building",
          exclusiveRoles: ["phone-supplier"]
        }
      },
      {
        // The selling side: everything that moves stock to and from
        // customers.
        path: "sales",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Sales", icon: "el-icon-sell" },
        children: [
          {
            // Selling stock: RSO-numbered orders that mark devices Sold.
            path: "/refurbished/sales-orders",
            component: (resolve) => require(["@/views/refurbished/salesOrders"], resolve),
            name: "RefurbishedSalesOrders",
            meta: {
              title: "Sales Orders",
              icon: "el-icon-sell",
              permissions: ["refurb:sale:view"]
            }
          },
          {
            // Devices coming back from a customer — picked from what that
            // customer currently holds, and back into stock on create.
            path: "/refurbished/sales-returns",
            component: (resolve) => require(["@/views/refurbished/salesReturns"], resolve),
            name: "RefurbishedSalesReturns",
            meta: {
              title: "Sales Return",
              icon: "el-icon-refresh-left",
              permissions: ["refurb:sale:view"]
            }
          },
          {
            // Buyer registry referenced by sales orders.
            path: "/refurbished/customers",
            component: (resolve) => require(["@/views/refurbished/customers"], resolve),
            name: "RefurbishedCustomers",
            meta: {
              title: "Customers",
              icon: "el-icon-user",
              permissions: ["refurb:sale:view"]
            }
          }
        ]
      },
      {
        // Consignment — devices placed with partner shops, moved in from
        // its old top-level spot. Insights + Shops are admin-side; Devices
        // is shared with the consignment-shop logins (whose data is scoped
        // server-side to their own shop).
        path: "consignment",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Consignment", icon: "el-icon-box" },
        children: [
          {
            path: "/consignment/insights",
            component: (resolve) => require(["@/views/consignment/insights"], resolve),
            name: "ConsignmentInsights",
            meta: { title: "Insights", icon: "el-icon-data-analysis", permissions: ["consign:insight:view"] }
          },
          {
            path: "/consignment/devices",
            component: (resolve) => require(["@/views/consignment/devices"], resolve),
            name: "ConsignmentDevices",
            meta: { title: "Devices", icon: "el-icon-mobile-phone", permissions: ["consign:device:view"] }
          },
          {
            path: "/consignment/shops",
            component: (resolve) => require(["@/views/consignment/shops"], resolve),
            name: "ConsignmentShops",
            meta: { title: "Shops", icon: "el-icon-s-shop", permissions: ["consign:shop:manage"] }
          }
        ]
      },
      {
        // The inbound and upkeep side: shipments arriving and units away
        // being fixed.
        path: "warehouse",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Warehouse", icon: "el-icon-truck" },
        children: [
          {
            // Supplier shipments counted in by the warehouse, then pushed
            // into Stock under the iMobile location. exclusiveRoles =
            // strict match: Admin and iMobile Admin (added 2026-09-21),
            // nobody else.
            path: "/refurbished/incoming",
            component: (resolve) => require(["@/views/refurbished/incoming"], resolve),
            name: "RefurbishedIncoming",
            meta: {
              title: "Incoming Stocks",
              icon: "el-icon-download",
              exclusiveRoles: ["admin", "imobile-admin"]
            }
          },
          {
            // Supplier shipments to iMobile — suppliers create them, staff
            // can watch them here too; the warehouse receives the
            // auto-created record through Incoming Stocks.
            path: "/refurbished/supply",
            component: (resolve) => require(["@/views/refurbished/supplyBatches"], resolve),
            name: "RefurbishedSupplyBatches",
            meta: {
              title: "Supply Batches",
              icon: "el-icon-truck",
              permissions: ["refurb:supply:view"]
            }
          },
          {
            // Faulty devices sent to a workshop and reconciled back in.
            // The list may include units we do not hold in the register.
            path: "/refurbished/repairs",
            component: (resolve) => require(["@/views/refurbished/repairs"], resolve),
            name: "RefurbishedRepairs",
            meta: {
              title: "For Repair",
              icon: "el-icon-set-up",
              permissions: ["refurb:repair:view"]
            }
          },
          {
            // The small managed list of workshops.
            path: "/refurbished/repairers",
            component: (resolve) => require(["@/views/refurbished/repairers"], resolve),
            name: "RefurbishedRepairers",
            meta: {
              title: "Repairers",
              icon: "el-icon-s-custom",
              permissions: ["refurb:repair:view"]
            }
          }
        ]
      },
    ]
  },
  {
    // Blackbelt — admin-only for now (only admin's wildcard carries
    // blackbelt:*). Page contents to be defined; placeholders meanwhile.
    path: "/blackbelt",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "Blackbelt", icon: "el-icon-medal" },
    children: [
      {
        path: "accounts",
        component: (resolve) => require(["@/views/blackbelt/accounts"], resolve),
        name: "BlackbeltAccounts",
        meta: { title: "Accounts", icon: "el-icon-office-building", permissions: ["blackbelt:account:view"] }
      },
      {
        path: "invoices",
        component: (resolve) => require(["@/views/blackbelt/invoices"], resolve),
        name: "BlackbeltInvoices",
        meta: { title: "Invoices", icon: "el-icon-tickets", permissions: ["blackbelt:invoice:view"] }
      }
    ]
  },
  {
    // Point of Sale — distributors embed our parts widget on their own
    // site and sell to their customers; orders land in their portal and,
    // once confirmed, become Zoho sales orders. Self-contained module:
    // backend routes/posRoutes, pos_* collections, pos:* permissions.
    path: "/pos",
    component: Layout,
    redirect: "noRedirect",
    alwaysShow: true,
    meta: { title: "Embed Ordering", icon: "el-icon-shopping-cart-full" },
    children: [
      {
        // Businesses embedding the widget — contact details, the sites
        // allowed to load it, their public key and Zoho contact.
        path: "distributors",
        component: (resolve) => require(["@/views/pos/distributors"], resolve),
        name: "PosDistributors",
        meta: {
          title: "Distributors",
          icon: "el-icon-office-building",
          permissions: ["pos:distributor:view"]
        }
      },
      {
        // Each distributor's own customers. Scoped by distributor, so the
        // same email can hold an account with two of them without their
        // data mixing. Created by the distributor, never self-registered.
        path: "customers",
        component: (resolve) => require(["@/views/pos/customers"], resolve),
        name: "PosCustomers",
        meta: {
          title: "Customers",
          icon: "el-icon-user",
          permissions: ["pos:customer:view"]
        }
      },
      {
        // The catalogue behind the widget: upload an image, draw polygon
        // hotspots, link products, publish.
        path: "/imobile/explodedDiagrams",
        component: (resolve) => require(["@/views/imobile/explodedDiagrams/index"], resolve),
        name: "ExplodedDiagrams",
        meta: {
          title: "Exploded Diagrams",
          icon: "el-icon-picture-outline",
          permissions: ["exploded:diagram:manage"]
        }
      }
    ]
  },
  {
    // ExEngine group — Devices + Accessories sub-sections. Structure scaffold;
    // pages are placeholders for now. NOTE: no permissions/roles set yet, so it
    // group renders for anyone whose permissions keep at least one child:
    // Devices/Accessories are exengine:* (admin-only), Scraper is
    // refurb:offer:view (admin, iMobile Admin, Phone Supplier).
    path: "/exengine",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "ExEngine", icon: "el-icon-cpu" },
    children: [
      {
        path: "devices",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Devices", icon: "el-icon-mobile-phone" },
        children: [
          {
            path: "/exengine/devices/insights",
            component: (resolve) => require(["@/views/exengine/devices/insights/index"], resolve),
            name: "ExEngineInsights",
            // Admin-only for now — only admin's wildcard carries exengine:*.
            meta: { title: "Insights", icon: "el-icon-data-analysis", permissions: ["exengine:insights:view"] }
          }
        ]
      },
      {
        path: "accessories",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Accessories", icon: "el-icon-headset" },
        children: [
          {
            // Placeholder so the Accessories tab renders — rename / replace when
            // its real pages are defined.
            path: "/exengine/accessories/overview",
            component: (resolve) => require(["@/views/exengine/accessories/overview/index"], resolve),
            name: "ExEngineAccessoriesOverview",
            meta: { title: "Overview", icon: "el-icon-menu", permissions: ["exengine:accessories:view"] }
          }
        ]
      },
      {
        // Scraper — scraped refurbished-market data (Reebelo / JB) from the
        // external MySQL DB. Moved here from the retired Refurbished Phones
        // group; the /refurbished/* URLs are kept so links keep working.
        path: "scraper",
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Scraper", icon: "el-icon-connection" },
        children: [
          {
            path: "/refurbished/scraper/dashboard",
            component: (resolve) => require(["@/views/refurbished/dashboard"], resolve),
            name: "RefurbishedDashboard",
            meta: {
              title: "Dashboard",
              icon: "el-icon-data-analysis",
              permissions: ["refurb:offer:view"]
            }
          },
          {
            path: "/refurbished/scraper/reebelo",
            component: (resolve) => require(["@/views/refurbished/list"], resolve),
            name: "RefurbishedList",
            meta: {
              title: "Reebelo",
              icon: "el-icon-tickets",
              permissions: ["refurb:offer:view"]
            }
          }
        ]
      }
    ]
  },
  // (Consignment now lives inside the Refurbished Device group above; the
  // /consignment/* page URLs are unchanged.)
  {
    path: "/tools",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: false,
    // Single visible child with alwaysShow:false renders as a top-level item.
    // The child's meta carries the role gate; only Admin + iMobile Admin
    // see the menu link and can resolve the route.
    meta: { title: "Tools", icon: "el-icon-magic-stick" },
    children: [
      {
        path: "",
        component: (resolve) => require(["@/views/tools/index"], resolve),
        name: "Tools",
        meta: {
          title: "Tools",
          icon: "el-icon-magic-stick",
          roles: ["admin", "imobile-admin"]
        }
      },
      {
        // Route-based tool — opens as a full page rather than a dialog.
        // Hidden from the sidebar; the tool is launched via its card on
        // the /tools index page.
        path: "locationMonitoring",
        component: (resolve) => require(["@/views/tools/locationMonitoring"], resolve),
        name: "ToolsLocationMonitoring",
        hidden: true,
        meta: {
          title: "Location Monitoring",
          activeMenu: "/tools",
          roles: ["admin", "imobile-admin"]
        }
      }
    ]
  },
  {
    path: "/system",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "System", icon: "el-icon-setting" },
    children: [
      {
        // AI Agent — agentic Claude chat over the business data. Moved here
        // from the retired Refurbished Phones group; URL kept as
        // /refurbished/ask so existing links (e.g. PhoneSupplierHome) work.
        path: "/refurbished/ask",
        component: (resolve) => require(["@/views/refurbished/ask"], resolve),
        name: "RefurbishedAsk",
        meta: {
          title: "AI Agent",
          icon: "el-icon-chat-line-round",
          permissions: ["ai:query:use"]
        }
      },
      {
        // Agent Skills — admin-authored knowledge base the AI Agent consults.
        path: "/refurbished/ai-skills",
        component: (resolve) => require(["@/views/refurbished/aiSkills"], resolve),
        name: "RefurbishedAiSkills",
        meta: {
          title: "Agent Skills",
          icon: "el-icon-notebook-2",
          // Separate from ai:query:use so chat-only roles (Phone Supplier)
          // don't see the knowledge base.
          permissions: ["ai:skills:manage"]
        }
      },
      {
        path: "users",
        component: (resolve) => require(["@/views/system/users/index"], resolve),
        name: "SystemUsers",
        meta: {
          title: "Users",
          icon: "peoples",
          permissions: ["system:user:manage"]
        }
      },
      {
        // Widget Setting — admin CRUD for the per-widget allowlist
        // the public /widget/* endpoints consult on every submission.
        // Same permission as Users (system:user:manage) since both
        // control who can talk to the backend.
        //
        // Path / component name / API URL stay as "widgetOrigin"
        // (those are internal stable identifiers); only the display
        // title is "Widget Setting".
        path: "widgetOrigin",
        component: (resolve) => require(["@/views/system/widgetOrigin/index"], resolve),
        name: "SystemWidgetOrigin",
        meta: {
          title: "Widget Setting",
          icon: "el-icon-link",
          permissions: ["system:user:manage"]
        }
      }
    ]
  }
];

// 动态路由，基于用户权限动态去加载
export const dynamicRoutes = [];

// 防止连续点击多次路由报错
let routerPush = Router.prototype.push;
let routerReplace = Router.prototype.replace;
// push
Router.prototype.push = function push(location) {
  return routerPush.call(this, location).catch((err) => err);
};
// replace
Router.prototype.replace = function push(location) {
  return routerReplace.call(this, location).catch((err) => err);
};

export default new Router({
  mode: "history", // 去掉url中的#
  scrollBehavior: () => ({ y: 0 }),
  // Register common + gated module routes. The sidebar and the navigation
  // guard filter the gated ones by the user's permissions.
  routes: constantRoutes.concat(moduleRoutes),
});
