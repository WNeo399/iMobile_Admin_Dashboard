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
    path: "/zohoInventory",
    component: Layout,
    redirect: "noRedirect",
    hidden: false,
    alwaysShow: true,
    meta: {title: "zoho Inventory", icon: "el-icon-notebook-2"},
    children: [
      {
        path: "stockMonitoring",
        component: (resolve)=>require(["@/views/zohoInventory/stockmonitoring"], resolve),
        name: "StockMonitoring",
        meta: {
          title: "Stock Mornitoring",
          icon: "goods",
          permissions: ["zoho:stock:view"]
        }
      },
      {
        path: "collections",
        component: (resolve)=>require(["@/views/products/collection"], resolve),
        name: "Collections",
        meta: {
          title: "Collections",
          icon: "goods",
          permissions: ["zoho:collection:view"]
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
          icon: "el-icon-mobile-phone",
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
