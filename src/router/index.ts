import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/cloud/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/',
      component: () => import('../components/AppLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/drive'
        },
        {
          path: 'drive/:pathMatch(.*)*',
          name: 'drive',
          component: () => import('../views/DriveView.vue')
        },
        {
          path: 'drive',
          name: 'drive-root',
          component: () => import('../views/DriveView.vue')
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('../views/SearchView.vue')
        },
        {
          path: 'shared',
          name: 'shared',
          component: () => import('../views/SharedView.vue')
        },
        {
          path: 'starred',
          name: 'starred',
          component: () => import('../views/StarredView.vue')
        },
        {
          path: 'trash',
          name: 'trash',
          component: () => import('../views/TrashView.vue')
        }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const token = localStorage.getItem('auth_token')
  if (!token && to.name !== 'login') {
    return { name: 'login' }
  }
  if (token && to.name === 'login') {
    return { name: 'drive-root' }
  }
})

export default router
