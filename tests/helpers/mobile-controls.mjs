export async function selectMobile(page,label,value){
  await page.getByRole('combobox',{name:label,exact:true}).click();
  await page.getByRole('listbox',{name:label,exact:true}).locator(`[role=option][data-value="${value}"]`).click();
}

export async function openMobileSettings(page){
  if(await page.locator('.mobile-settings').isVisible())return;
  const back=page.getByRole('button',{name:'返回笔记',exact:true});
  if(await back.isVisible())await back.click();
  await page.getByRole('button',{name:'选择知识库',exact:true}).click();
  await page.getByRole('dialog',{name:'知识库',exact:true}).getByRole('button',{name:'设置',exact:true}).click();
}
