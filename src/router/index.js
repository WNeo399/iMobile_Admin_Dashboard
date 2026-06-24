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
    // Inventory is currently the only child; new modules (Sales, Customers,
    // etc.) can be added as siblings of `inventory` later without touching
    // the deepest leaves.
    //
    // Path stays `/zohoInventory/...` for the actual pages so existing
    // deep links and the home-page quick-action links (which reference
    // `/zohoInventory/stockMonitoring` etc.) keep working — we just nest
    // them inside the iMobile group at the sidebar / routing layer.
    path: "/imobile",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: { title: "iMobile", icon: "el-icon-goods" },
    children: [
      {
        path: "inventory",
        // ParentView is a transparent <router-view /> wrapper used by
        // RuoYi/vue-element-admin to render nested submenu groups without
        // adding a real page in the middle.
        component: (resolve) => require(["@/components/ParentView"], resolve),
        redirect: "noRedirect",
        alwaysShow: true,
        meta: { title: "Inventory", icon: "el-icon-notebook-2" },
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
            path: "/zohoInventory/collections",
            component: (resolve) => require(["@/views/products/collection"], resolve),
            name: "Collections",
            meta: {
              title: "Collections",
              // Stacked files icon for a grouping of products; previously
              // shared `goods` with Stock Monitoring and rendered blank.
              icon: "el-icon-files",
              permissions: ["zoho:collection:view"]
            }
          }
        ]
      },
      {
        // Catalogue — the IMB parts catalogue (imb_products + its
        // brand/category/model/quality reference data). Sibling of
        // Inventory under iMobile, using the same ParentView submenu
        // wrapper. Reuses the collection permissions since the same
        // iMobile Admin role manages this product data.
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
      },
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
          permissions: ["zoho:salesOrder:create"]
        }
      },
      {
        // Apple SVP Lookup — customer enquiries (imb_svp_enquiry) raised by the
        // public genuine-parts lookup site when a serial isn't on record and
        // the customer asks us to confirm with the supplier.
        path: "svpEnquiry",
        component: (resolve) => require(["@/views/imobile/svp/enquiries"], resolve),
        name: "ImobileSvpEnquiry",
        meta: {
          title: "SVP Enquiries",
          icon: "el-icon-search",
          permissions: ["svp:enquiry:view"]
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
